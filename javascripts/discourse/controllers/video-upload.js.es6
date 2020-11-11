import { getOwner } from "discourse-common/lib/get-owner";
import ModalFunctionality from "discourse/mixins/modal-functionality";

const STATUS_POLLING_INTERVAL_MILLIS = 10000;

export default Ember.Controller.extend(ModalFunctionality, {
    uploadProgress: 0,
    isUploading: false,
    isProcessing: false,
    defaultPrivacy: 'unlisted',
    vimeoEnabled: false,
    youtubeEnabled: false,
    uploadError: null,

    init() {
        this._super(...arguments);
        this.vimeoEnabled = settings.vimeo_upload_enabled;
        this.youtubeEnabled = settings.youtube_upload_enabled;
        this.vimeoUploadScope = settings.vimeo_default_view_privacy;
    },
    onShow() {
        const component = this;
        setTimeout(() => $("#video-file").change(() => component.validateVideoFile(component)), 1000);
        component.setProperties({
            isProcessing: false,
            processingError: false,
            uploadError: null,
            isUploading: false,
            isAuthing: false
        });
    },
    validateVideoFile(component) {
        const file = $("#video-file").prop('files');
        if (!file || file.length < 1) return false;
        if (!file[0].type.startsWith('video/')) {
            alert("Invalid video file");
            return false;
        }

        $("#video-title").val(file[0].name);
        $("#video-scope").val("unlisted");

        return true;
    },
    updateProgress(data, component) {
        const progress = Math.floor(data.loaded / data.total * 100)
        component.set('uploadProgress', progress);
    },
    actions: {
        vimeoUpload() {
            const file = $("#video-file").prop('files');
            const composer = getOwner(this).lookup("controller:composer");
            const component = this;
            component.setProperties({
                isUploading: true,
                uploadProgress: 0,
                isProcessing: false,
                processingError: false,
                uploadError: null
            });

            $("#vimeo-upload-btn").attr('disabled', 'disabled');

            let uploadUrl = '';

            const uploadInst = new VimeoUpload({
                file: file[0],
                token: settings.vimeo_api_access_token,
                name: $("#video-title").val(),
                description: $("#video-description").val() + '\nby @' + component.currentUser.username,
                view: settings.vimeo_default_view_privacy,
                embed: settings.vimeo_default_embed_privacy,
                upgrade_to_1080: true,
                onError: function(data) {
                    console.error('<strong>Error</strong>: ' + JSON.parse(data).error, 'danger')
                    component.setProperties({
                        uploadProgress: 0,
                        isUploading: false,
                        uploadError: JSON.parse(data).error
                    });
                },
                onProgress: data => component.updateProgress(data, component),
                onComplete: function(videoId, index) {
                    component.setProperties({
                        uploadProgress: 0,
                        isUploading: false,
                        isProcessing: true,
                    });
                    uploadUrl = 'https://vimeo.com/' + videoId;
                    component.vimeoUploadStatus(uploadInst, uploadUrl, composer, component);
                }
            });

            uploadInst.upload();
        },
        youtubeUpload() {
            const component = this;
            component.setProperties({
                isAuthing: true,
                isUploading: false,
                uploadProgress: 0,
                isProcessing: false,
                processingError: false,
                uploadError: null
            });

            const checkScopeAndUpload = function () {
                const authResponse = gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse();
                if (authResponse.scope.indexOf(ytScopes[0]) >= 0 && authResponse.scope.indexOf(ytScopes[1]) >= 0) {
                    component.sendFileToYoutube()
                    return true;
                }
                return false;
            }

            const ytScopes = ['https://www.googleapis.com/auth/youtube', 'https://www.googleapis.com/auth/youtube.readonly'];
            gapi.load('client:auth2', function () {
                gapi.client.init({
                    clientId: settings.youtube_api_client_id,
                    scope: ytScopes.join(' ')
                }).then(function () {
                    if (!(gapi.auth2.getAuthInstance().isSignedIn.get() && checkScopeAndUpload()))
                        gapi.auth2.getAuthInstance().signIn().then(checkScopeAndUpload)
                })
            });
        }
    },
    sendFileToYoutube() {
        const accessToken = gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token;
        const component = this;
        const file = $("#video-file").prop('files');
        $("#youtube-upload-btn").attr('disabled', 'disabled');

        component.setProperties({
            isUploading: true,
            isAuthing: false
        });

        const metadata = {
            snippet: {
                title: $("#video-title").val(),
                description: $("#video-description").val()
            },
            status: {
                privacyStatus: $("#video-scope").val()
            }
        };
        const uploader = new YoutubeUpload({
            baseUrl: 'https://www.googleapis.com/upload/youtube/v3/videos',
            file: file[0],
            token: accessToken,
            metadata: metadata,
            params: {
                part: Object.keys(metadata).join(',')
            },
            onError: function(data) {
                let message = data;
                // Assuming the error is raised by the YouTube API, data will be
                // a JSON string with error.message set. That may not be the
                // only time onError will be raised, though.
                try {
                    const errorResponse = JSON.parse(data);
                    message = errorResponse.error.message;
                } finally {
                    console.error(message);
                    component.setProperties({
                        isUploading: false,
                        uploadError: message
                    });
                }
            }.bind(this),
            onProgress: function(data) { component.updateProgress(data, component) }.bind(this),
            onComplete: function(data) {
                const uploadResponse = JSON.parse(data);
                component.ytVideoId = uploadResponse.id;

                component.setProperties({
                    uploadProgress: 0,
                    isUploading: false,
                    isProcessing: true,
                });
                $("#youtube-upload-btn").removeAttr('disabled');
                component.youtubeUploadStatus();
            }.bind(this)
        });
        uploader.upload();
    },
    youtubeUploadStatus() {
        const composer = getOwner(this).lookup("controller:composer");
        const component = this;
        gapi.client.request({
            path: '/youtube/v3/videos',
            params: {
                part: 'status,player',
                id: component.ytVideoId
            },
            callback: function (response) {
                if (response.error) {
                    // The status polling failed.
                    console.log(response.error.message);
                    setTimeout(component.youtubeUploadStatus().bind(this), STATUS_POLLING_INTERVAL_MILLIS);
                } else {
                    var uploadStatus = response.items[0].status.uploadStatus;
                    switch (uploadStatus) {
                        case 'uploaded':
                            setTimeout(component.youtubeUploadStatus.bind(this), STATUS_POLLING_INTERVAL_MILLIS);
                            break;
                        case 'processed':
                            component.set('isProcessing', false);
                            composer.model.appEvents.trigger("composer:insert-block", '\nhttps://youtu.be/' + component.ytVideoId + '\n');
                            component.send('closeModal');
                            break;
                        // All other statuses indicate a permanent transcoding failure.
                        default:
                            component.set('processingError', true);
                            component.set('isProcessing', false);
                            break;
                    }
                }
            }.bind(this)
        });
    },
    vimeoUploadStatus(uploadInst, uploadUrl, composer, component) {
        const interval = setInterval(function () {
            uploadInst.transcodeStatus(function (status) {
                if (status === 'in_progress') return ;
                clearInterval(interval);
                component.set('isProcessing', false);
                $("#vimeo-upload-btn").removeAttr('disabled');
                if (status === 'error') component.set('processingError', true);
                else if (status === 'complete') {
                    composer.model.appEvents.trigger("composer:insert-block", '\n' + uploadUrl + '\n');
                    component.send('closeModal');
                }
            }, function (error) {
                clearInterval(interval);
                component.setProperties({
                    isProcessing: false,
                    processingError: true
                });
            })
        }, STATUS_POLLING_INTERVAL_MILLIS);
    }
});










































/** Common RetryHandler for YouTube and Vimeo. */

var RetryHandler = function() {
    this.interval = 1000 // Start at one second
    this.maxInterval = 60 * 1000; // Don't wait longer than a minute
}

/**
 * Invoke the function after waiting
 *
 * @param {function} fn Function to invoke
 */
RetryHandler.prototype.retry = function(fn) {
    setTimeout(fn, this.interval)
    this.interval = this.nextInterval_()
}

/**
 * Reset the counter (e.g. after successful request)
 */
RetryHandler.prototype.reset = function() {
    this.interval = 1000
}

/**
 * Calculate the next wait time.
 * @return {number} Next wait interval, in milliseconds
 *
 * @private
 */
RetryHandler.prototype.nextInterval_ = function() {
    var interval = this.interval * 2 + this.getRandomInt_(0, 1000)
    return Math.min(interval, this.maxInterval)
}

/**
 * Get a random int in the range of min to max. Used to add jitter to wait times.
 *
 * @param {number} min Lower bounds
 * @param {number} max Upper bounds
 * @private
 */
RetryHandler.prototype.getRandomInt_ = function(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min)
}

// -------------------------------------------------------------------------
// Private data

/* Library defaults, can be changed using the 'defaults' member method,

- api_url (string), vimeo api url
- name (string), default video name
- description (string), default video description
- contentType (string), video content type
- token (string), vimeo api token
- file (object), video file
- metadata (array), data to associate with the video
- upgrade_to_1080 (boolean), set video resolution to high definition
- offset (int),
- chunkSize (int),
- retryHandler (RetryHandler), hanlder class
- onComplete (function), handler for onComplete event
- onProgress (function), handler for onProgress event
- onError (function), handler for onError event

*/

var vimeoDefaults = {
    api_url: 'https://api.vimeo.com',
    name: 'Default name',
    description: 'Default description',
    contentType: 'application/offset+octet-stream',
    api_version: '3.4',
    token: null,
    file: {},
    metadata: [],
    upgrade_to_1080: false,
    offset: 0,
    chunkSize: 0,
    retryHandler: new RetryHandler(),
    onComplete: function() {},
    onProgress: function() {},
    onError: function() {}
}

/**
 * Helper class for resumable uploads using XHR/CORS. Can upload any Blob-like item, whether
 * files or in-memory constructs.
 *
 * @example
 * var content = new Blob(["Hello world"], {"type": "text/plain"})
 * var uploader = new VimeoUpload({
 *   file: content,
 *   token: accessToken,
 *   onComplete: function(data) { ... }
 *   onError: function(data) { ... }
 * })
 * uploader.upload()
 *
 * @constructor
 * @param {object} options Hash of options
 * @param {string} options.token Access token
 * @param {blob} options.file Blob-like item to upload
 * @param {string} [options.fileId] ID of file if replacing
 * @param {object} [options.params] Additional query parameters
 * @param {string} [options.contentType] Content-type, if overriding the type of the blob.
 * @param {object} [options.metadata] File metadata
 * @param {function} [options.onComplete] Callback for when upload is complete
 * @param {function} [options.onProgress] Callback for status for the in-progress upload
 * @param {function} [options.onError] Callback if upload fails
 */
var VimeoUpload = function(opts) {

    /* copy user options or use default values */
    for (var i in vimeoDefaults) {
        this[i] = (opts[i] !== undefined) ? opts[i] : vimeoDefaults[i]
    }
    this.accept = 'application/vnd.vimeo.*+json;version=' + this.api_version

    this.httpMethod = opts.fileId ? 'PUT' : 'POST'

    this.videoData = {
        name: (opts.name > '') ? opts.name : vimeoDefaults.name,
        description: (opts.description > '') ? opts.description : vimeoDefaults.description,
        privacy: {
            view: opts.view ? opts.view : ( opts.private ? 'nobody' : 'anybody' ),
            embed: opts.embed ? opts.embed : 'public'
        },
    }

    if (!(this.url = opts.url)) {
        var params = opts.params || {} /*  TODO params.uploadType = 'resumable' */
        this.url = this.buildUrl_(opts.fileId, params, opts.baseUrl)
    }
}

// -------------------------------------------------------------------------
// Public methods

/*
  Override class defaults

    Parameters:
    - opts (object): name value pairs

*/

VimeoUpload.prototype.defaults = function(opts) {
    return vimeoDefaults /* TODO $.extend(true, defaults, opts) */
}

/**
 * Initiate the upload (Get vimeo ticket number and upload url)
 */
VimeoUpload.prototype.upload = function() {
    var xhr = new XMLHttpRequest()
    xhr.open(this.httpMethod, this.url, true)
    if (this.token) {
        xhr.setRequestHeader('Authorization', 'Bearer ' + this.token)
    }
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.setRequestHeader('Accept', this.accept)

    xhr.onload = function(e) {
        // get vimeo upload  url, user (for available quote), ticket id and complete url
        if (e.target.status < 400) {
            var response = JSON.parse(e.target.responseText)
            this.url = response.upload.upload_link
            this.video_url = response.uri
            this.user = response.user
            this.ticket_id = response.ticket_id
            this.complete_url = vimeoDefaults.api_url + response.complete_uri
            this.sendFile_()
        } else {
            this.onUploadError_(e)
        }
    }.bind(this)

    xhr.onerror = this.onUploadError_.bind(this)
    var body = this.videoData
    body.upload = {
        approach: 'tus',
        size: this.file.size
    }
    xhr.send(JSON.stringify(body))
}

VimeoUpload.prototype.transcodeStatus = function(onComplete, onError) {
    $.ajax(vimeoDefaults.api_url + this.video_url, {
        headers: {
            'Authorization': 'Bearer ' + this.token,
            'Content-Type': 'application/json',
            'Accept': this.accept
        },
        error: onError,
        success: function (data) {
            onComplete(data.transcode.status);
        }
    });
}

// -------------------------------------------------------------------------
// Private methods

/**
 * Send the actual file content.
 *
 * @private
 */
VimeoUpload.prototype.sendFile_ = function() {
    var content = this.file
    var end = this.file.size

    if (this.offset || this.chunkSize) {
        // Only bother to slice the file if we're either resuming or uploading in chunks
        if (this.chunkSize) {
            end = Math.min(this.offset + this.chunkSize, this.file.size)
        }
        content = content.slice(this.offset, end)
    }

    var xhr = new XMLHttpRequest()
    xhr.open('PATCH', this.url, true)
    xhr.setRequestHeader('Accept', this.accept)
    xhr.setRequestHeader('Tus-Resumable', '1.0.0')
    xhr.setRequestHeader('Upload-Offset', this.offset)
    xhr.setRequestHeader('Content-Type', this.contentType)

    if (xhr.upload) {
        xhr.upload.addEventListener('progress', this.onProgress)
    }
    xhr.onload = this.onContentUploadSuccess_.bind(this)
    xhr.onerror = this.onContentUploadError_.bind(this)
    xhr.send(content)
}

/**
 * Query for the state of the file for resumption.
 *
 * @private
 */
VimeoUpload.prototype.resume_ = function() {
    var xhr = new XMLHttpRequest()
    xhr.open('HEAD', this.url, true)
    xhr.setRequestHeader('Tus-Resumable', '1.0.0');
    xhr.setRequestHeader('Accept', this.accept)
    if (xhr.upload) {
        xhr.upload.addEventListener('progress', this.onProgress)
    }
    var onload = function(e) {
        var response = JSON.parse(e.target.responseText)
        this.offset = response.offset
        if (this.offset >= this.file.size) {
            this.onContentUploadSuccess_(e)
        } else {
            this.sendFile_()
        }
    }
    xhr.onload = onload.bind(this);
    xhr.onerror = this.onContentUploadError_.bind(this)
    xhr.send()
}

/**
 * Extract the last saved range if available in the request.
 *
 * @param {XMLHttpRequest} xhr Request object
 */
VimeoUpload.prototype.extractRange_ = function(xhr) {
    var range = xhr.getResponseHeader('Range')
    if (range) {
        this.offset = parseInt(range.match(/\d+/g).pop(), 10) + 1
    }
}

/**
 * The final step is to call vimeo.videos.upload.complete to queue up
 * the video for transcoding.
 *
 * If successful call 'onUpdateVideoData_'
 *
 * @private
 */
VimeoUpload.prototype.complete_ = function(xhr) {
    var video_id = this.video_url.split('/').pop()
    this.onComplete(video_id);
}

/**
 * Handle successful responses for uploads. Depending on the context,
 * may continue with uploading the next chunk of the file or, if complete,
 * invokes vimeo complete service.
 *
 * @private
 * @param {object} e XHR event
 */
VimeoUpload.prototype.onContentUploadSuccess_ = function(e) {
    if (e.target.status >= 200 && e.target.status < 300) {
        this.complete_()
    } else if (e.target.status == 308) {
        this.extractRange_(e.target)
        this.retryHandler.reset()
        this.sendFile_()
    }
}

/**
 * Handles errors for uploads. Either retries or aborts depending
 * on the error.
 *
 * @private
 * @param {object} e XHR event
 */
VimeoUpload.prototype.onContentUploadError_ = function(e) {
    if (e.target.status && e.target.status < 500) {
        this.onError(e.target.response)
    } else {
        this.retryHandler.retry(this.resume_())
    }
}

/**
 * Handles errors for the complete request.
 *
 * @private
 * @param {object} e XHR event
 */
VimeoUpload.prototype.onCompleteError_ = function(e) {
    this.onError(e.target.response); // TODO - Retries for initial upload
}

/**
 * Handles errors for the initial request.
 *
 * @private
 * @param {object} e XHR event
 */
VimeoUpload.prototype.onUploadError_ = function(e) {
    this.onError(e.target.response); // TODO - Retries for initial upload
}

/**
 * Construct a query string from a hash/object
 *
 * @private
 * @param {object} [params] Key/value pairs for query string
 * @return {string} query string
 */
VimeoUpload.prototype.buildQuery_ = function(params) {
    params = params || {}
    return Object.keys(params).map(function(key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(params[key])
    }).join('&')
}

/**
 * Build the drive upload URL
 *
 * @private
 * @param {string} [id] File ID if replacing
 * @param {object} [params] Query parameters
 * @return {string} URL
 */
VimeoUpload.prototype.buildUrl_ = function(id, params, baseUrl) {
    var url = baseUrl || vimeoDefaults.api_url + '/me/videos'
    if (id) {
        url += id
    }
    var query = this.buildQuery_(params)
    if (query) {
        url += '?' + query
    }
    return url
}









var YoutubeUpload = function(options) {
    var noop = function() {};
    this.file = options.file;
    this.contentType = options.contentType || this.file.type || 'application/octet-stream';
    this.metadata = options.metadata || {
        'title': this.file.name,
        'mimeType': this.contentType
    };
    this.token = options.token;
    this.onComplete = options.onComplete || noop;
    this.onProgress = options.onProgress || noop;
    this.onError = options.onError || noop;
    this.offset = options.offset || 0;
    this.chunkSize = options.chunkSize || 0;
    this.retryHandler = new RetryHandler();

    this.url = options.url;
    if (!this.url) {
        var params = options.params || {};
        params.uploadType = 'resumable';
        this.url = this.buildUrl_(options.fileId, params, options.baseUrl);
    }
    this.httpMethod = options.fileId ? 'PUT' : 'POST';
};

/**
 * Initiate the upload.
 */
YoutubeUpload.prototype.upload = function() {
    var self = this;
    var xhr = new XMLHttpRequest();

    xhr.open(this.httpMethod, this.url, true);
    if (this.token) xhr.setRequestHeader('Authorization', 'Bearer ' + this.token);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-Upload-Content-Length', this.file.size);
    xhr.setRequestHeader('X-Upload-Content-Type', this.contentType);

    xhr.onload = function(e) {
        if (e.target.status < 400) {
            var location = e.target.getResponseHeader('Location');
            this.url = location;
            this.sendFile_();
        } else {
            this.onUploadError_(e);
        }
    }.bind(this);
    xhr.onerror = this.onUploadError_.bind(this);
    xhr.send(JSON.stringify(this.metadata));
};

/**
 * Send the actual file content.
 *
 * @private
 */
YoutubeUpload.prototype.sendFile_ = function() {
    var content = this.file;
    var end = this.file.size;

    if (this.offset || this.chunkSize) {
        // Only bother to slice the file if we're either resuming or uploading in chunks
        if (this.chunkSize) {
            end = Math.min(this.offset + this.chunkSize, this.file.size);
        }
        content = content.slice(this.offset, end);
    }

    var xhr = new XMLHttpRequest();
    xhr.open('PUT', this.url, true);
    xhr.setRequestHeader('Content-Type', this.contentType);
    xhr.setRequestHeader('Content-Range', 'bytes ' + this.offset + '-' + (end - 1) + '/' + this.file.size);
    xhr.setRequestHeader('X-Upload-Content-Type', this.file.type);
    if (xhr.upload) {
        xhr.upload.addEventListener('progress', this.onProgress);
    }
    xhr.onload = this.onContentUploadSuccess_.bind(this);
    xhr.onerror = this.onContentUploadError_.bind(this);
    xhr.send(content);
};

/**
 * Query for the state of the file for resumption.
 *
 * @private
 */
YoutubeUpload.prototype.resume_ = function() {
    var xhr = new XMLHttpRequest();
    xhr.open('PUT', this.url, true);
    xhr.setRequestHeader('Content-Range', 'bytes */' + this.file.size);
    xhr.setRequestHeader('X-Upload-Content-Type', this.file.type);
    if (xhr.upload) {
        xhr.upload.addEventListener('progress', this.onProgress);
    }
    xhr.onload = this.onContentUploadSuccess_.bind(this);
    xhr.onerror = this.onContentUploadError_.bind(this);
    xhr.send();
};

/**
 * Extract the last saved range if available in the request.
 *
 * @param {XMLHttpRequest} xhr Request object
 */
YoutubeUpload.prototype.extractRange_ = function(xhr) {
    var range = xhr.getResponseHeader('Range');
    if (range) {
        this.offset = parseInt(range.match(/\d+/g).pop(), 10) + 1;
    }
};

/**
 * Handle successful responses for uploads. Depending on the context,
 * may continue with uploading the next chunk of the file or, if complete,
 * invokes the caller's callback.
 *
 * @private
 * @param {object} e XHR event
 */
YoutubeUpload.prototype.onContentUploadSuccess_ = function(e) {
    if (e.target.status == 200 || e.target.status == 201) {
        this.onComplete(e.target.response);
    } else if (e.target.status == 308) {
        this.extractRange_(e.target);
        this.retryHandler.reset();
        this.sendFile_();
    }
};

/**
 * Handles errors for uploads. Either retries or aborts depending
 * on the error.
 *
 * @private
 * @param {object} e XHR event
 */
YoutubeUpload.prototype.onContentUploadError_ = function(e) {
    if (e.target.status && e.target.status < 500) {
        this.onError(e.target.response);
    } else {
        this.retryHandler.retry(this.resume_.bind(this));
    }
};

/**
 * Handles errors for the initial request.
 *
 * @private
 * @param {object} e XHR event
 */
YoutubeUpload.prototype.onUploadError_ = function(e) {
    this.onError(e.target.response); // TODO - Retries for initial upload
};

/**
 * Construct a query string from a hash/object
 *
 * @private
 * @param {object} [params] Key/value pairs for query string
 * @return {string} query string
 */
YoutubeUpload.prototype.buildQuery_ = function(params) {
    params = params || {};
    return Object.keys(params).map(function(key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
    }).join('&');
};

/**
 * Build the drive upload URL
 *
 * @private
 * @param {string} [id] File ID if replacing
 * @param {object} [params] Query parameters
 * @return {string} URL
 */
YoutubeUpload.prototype.buildUrl_ = function(id, params, baseUrl) {
    var url = baseUrl || DRIVE_UPLOAD_URL;
    if (id) {
        url += id;
    }
    var query = this.buildQuery_(params);
    if (query) {
        url += '?' + query;
    }
    return url;
};

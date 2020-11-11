import { withPluginApi } from "discourse/lib/plugin-api";
import showModal from "discourse/lib/show-modal";

function initializeDiscourseVideoUpload(api) {
  const composerController = api.container.lookup("controller:composer");
  composerController.video_upload_settings = settings;

  if (settings.youtube_upload_enabled || settings.vimeo_upload_enabled) {
    api.modifyClass("component:d-editor", {
      actions: {
        openVideoUploadModal() {
          showModal("video-upload");
        }
      }
    });

    api.onToolbarCreate(tb => {
      tb.addButton({
        id: 'video-upload',
        group: 'insertions',
        icon: 'video',
        sendAction: () => tb.context.send('openVideoUploadModal'),
        title: 'video_upload'
      })
    });
  }

}

export default {
  name: "discourse-video-upload",

  initialize() {
    withPluginApi("0.8.31", initializeDiscourseVideoUpload);
  }
};

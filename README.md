# Discourse Video Upload Theme Component

This new theme component enables video uploads from the Discourse composer to YouTube and Vimeo. For those already familiar with [the plugin I developed recently](https://meta.discourse.org/t/discourse-video-upload-plugin-with-youtube-and-vimeo/168569), the same is now available in this Theme Component which can be added to any theme. This makes for a much easier installation and works in exactly the same way as the plugin.

## Features

All forum members can upload videos to Vimeo or YouTube (admins can choose to enable either or both).

Admins can control the view and embed privacy of the videos uploaded to Vimeo using admin settings.

User can control view privacy of the videos uploaded to YouTube from the upload modal.

You can watch a demo of the plugin here (everything is same in the component except for the settings page. 
The component settings page is found under Admin > Customize > Components > Video Upload):
https://vimeo.com/474476485

## Setup

- Add the theme component by going to Admin > Customize > Themes > Components
  - Click `Install`
  - Choose `From a git repository`
  - Use the link `https://github.com/xomads/discourse-video-upload-component.git`

**Important**: For theme components, you need to make sure you activate the component for the themes used on your instance (either click `Add all themes` or choose the themes you want).
![image|690x221, 50%](https://d11a6trkgmumsb.cloudfront.net/optimized/3X/3/7/37e188a773f3cabecd69e21f9d196a0676ac712a_2_517x165.png)  
 
* The developer setup for enabling uploads to YouTube and Vimeo are listed below. If you prefer someone to do it for you, you can request support by contacting me, @ti0.

### For YouTube Uploads

** YouTube uploads go to the uploaders account, unlike Vimeo uploads which go to a common account.

![YouTube setup steps](https://d11a6trkgmumsb.cloudfront.net/original/3X/b/9/b9551db2408411188b8f8417efd3425184004117.png)

- Create an account and project at https://console.developers.google.com

- Enable the YouTube Data API v3

- Setup the OAuth consent screen for External users (unless all users on your Discourse forum belong to one Google organization).

- Setup your credentials:
  - Create an OAuth client ID
  - Choose Web Application type
  - Add your Discourse instance URL in the Authorized Javascript origins section 

- Copy the generated client ID only

- Go to the component settings page in Discourse Admin, and paste the client ID in the `youtube api client id` field. 

- Enable Youtube uploads by enabling this setting: `youtube upload enabled`

- Adjust the default view privacy options for Youtube if required.

- You should now be able to upload videos from the Discourse topic composer directly to YouTube.

### For Vimeo Uploads

**Once you setup the plugin with the steps below, <b>all community users will be able to upload videos to *your Vimeo account*.</b>
You are responsible for limits and usage of your Vimeo account.** 

- Create an account and app on Vimeo Developers:
https://developer.vimeo.com/apps/new

- Request Upload Access on the app page

- Generate an access token with Upload permissions

- Go to the component settings page on your Discourse Admin, and add the generated access token in the `vimeo api access token` setting, and save

- Enable Vimeo uploads by enabling the `vimeo upload enabled` setting.

- Adjust view and embed privacy options 

  - See [this vimeo page](https://developer.vimeo.com/api/reference/videos#edit_video) for privacy options: `privacy.view` and `privacy.embed`

- You should now be able to upload videos from the Discourse topic composer directly to Vimeo

## Posting a video

- To post a video, create a new Topic or reply to an existing
 topic. 
 
- Click the new `Upload to Video` button in the composer toolbar (the video icon). This button is only visible if you have enabled either YouTube or Vimeo (or both) in the plugin settings.

- Choose a video file and edit the details such as title and description, if you wish.
  
- Click the Upload to Vimeo or Upload to YouTube button. 
  - The buttons shown will depend on whether you have enabled YouTube / Vimeo uploads (either or both).
  - It will show you upload progress, and then it will wait till the video completes the transcoding process.
  - The modal will remain open till the transcoding is complete.
  - Once transcoding is complete, the video link will be added to the composer (unless there was a transcoding error).
  
- Save the post, and your video can be viewed by all other community users 
  (depending on privacy options you selected).
  
### Feature Requests

You can request additional features or support by [contacting me](https://meta.discourse.org/u/ti0/summary).  

### Contributions

If you found the plugin helpful, please consider donating to the plugin developer using this Paypal link:
https://paypal.me/ti0it

Big and small contributions are equally welcome :) 

If you would like to enhance the plugin, PRs are welcome.

---
description: How to create add images in markdown file.
---

# Add images

## Create new directory for images
:::info
If there is dedicated dir for your topic, please ingore this step and uplaod the image files to the dir directly.
:::

Create new directory website/static/img. Open website/static/img and click **Add file > Create new file**, add the **rocketchat/** in the path, **/** means directory rather than files.
Then input an new tmp file like hello.md and commit the changes. The new directory named **rocketchat** created in the img directory.

## Upload the image files  

Upload the image files like png ang svg in the website/static/img/rocketchat. Open website/static/img/rocketchat and click **Add file > Upload files**, then select files like Microsoft-authorization-code-flow.svg to upload.

## Add image in the markdown file

```js title="website/docs/rocketchat/rocketchat-microsoft-oauth.mdx"

<p align="center">
![](/img/rocketchat/Microsoft-authorization-code-flow.svg)
</p>

```

```mermaid
graph TD;
    A-->B;
    A-->C;
    B-->D;
    C-->D;
```

```mermaid

sequenceDiagram
    participant User
    participant Application
    participant MicrosoftIdentityPlatform as Microsoft Identity Platform
    participant ResourceServer as Resource Server

    User->>Application: Navigate to the application
    Application->>MicrosoftIdentityPlatform: Redirect to Microsoft for authentication
    MicrosoftIdentityPlatform->>User: User authenticates and consents
    User->>MicrosoftIdentityPlatform: Authentication and consent response
    MicrosoftIdentityPlatform->>Application: Redirect back with authorization code
    Application->>MicrosoftIdentityPlatform: Request access token with authorization code
    MicrosoftIdentityPlatform->>Application: Issue access token
    Application->>ResourceServer: Access resources with access token
    activate ResourceServer
    ResourceServer->>Application: Resource response
    Note right of ResourceServer: Activation during resource access
    deactivate ResourceServer

```


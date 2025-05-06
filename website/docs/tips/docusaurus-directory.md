---
description: How to create new directory.
---

# Add directory

How to create new directory step by step for **new topic**? Although it is relatively simple, after a long time, you may not remember how to operate it. Following these steps can quickly create directories and files within directories.
The main idea is to copy the previously created directory and content, and then make revisions.

:::tip[Useful Links]

⚡️ [`website/sidebars.ts`](https://github.com/TheBestOrNothing/thebestornothing.github.io/edit/main/website/sidebars.ts)

⚡️ [`website/docs/rocketchat`](https://github.com/TheBestOrNothing/thebestornothing.github.io/tree/main/website/docs/tips)

:::


## Clone repository  
Clone the repository from [`github`](https://github.com/TheBestOrNothing/thebestornothing.github.io). 

## Create new directory
Copy, paste and rename the [`website/docs/rocketchat`](https://github.com/TheBestOrNothing/thebestornothing.github.io/tree/main/website/docs/rocketchat) diretory. 
All the files in the rocketchat will be in the new dirctory.

## Configure website sidebars.ts
Copy and paste the 'RocketChat Oauth' to 'Chat Messaging' in the [`website/sidebars.ts`](https://github.com/TheBestOrNothing/thebestornothing.github.io/edit/main/website/sidebars.ts) file.
Adapte the directory name in the items of 'Chat Messaging'. After commit the changes in the sidebar.ts file. There is new direct named 'Chat Messaging' showed in the webpage.
So in the webpage the 'Chat Messaging' items are same as 'RocketChat Oauth'.

```js title="sidebars.ts"
   {
      type: 'category',
      label: 'Tips',
      link: {
        type: 'generated-index',
      },
      items: [
        'tips/docusaurus-quickstart',
        'tips/docusaurus-homepage',
        'tips/docusaurus-directory',
        'tips/docusaurus-addimage',
        'tips/docusaurus-diagrams',
      ],
   },
   {
      type: 'category',
      label: 'Chat Messaging',
      link: {
        type: 'doc',
        id: 'stream/stream-getstreamio',
      },
      items: [
        'stream/publishing-android-libraries-nexus',
        'stream/publishing-android-libraries-jitpack',
        'stream/debugging-with-ngrok',
        'stream/stream-feeds',
      ],
   },
```

## Adapte files in the directory
Adapte the files in the 'Chat Messaging' directory especially the filename(debugging-with-ngrok.mdx), id(debugging-with-ngrok) and First level title(Debugging with Ngrok).
The the first level title will showed in the sidebar in the webpage.

```yml title="debugging-with-ngrok.mdx"
---
id: debugging-with-ngrok
description: Create a Markdown Document
---

# Debugging with Ngrok

Ngrok is a tool allows you to expose a port on your local machine to the internet, allowing you to receive and monitor incoming requests from external sources such as webhooks. This makes Ngrok a perfect fit for debugging webhook payloads that come from Stream Chat.

```



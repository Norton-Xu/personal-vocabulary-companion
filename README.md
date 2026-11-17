# Personal Vocabulary Companion

A tiny personal vocabulary app. Add one word, receive a Learner's Dictionary definition and example, then review it when due.

## What it stores

Words and review dates stay in this browser's `localStorage`. They are not sent to the Worker.

## Deploy the dictionary Worker

1. In Cloudflare, create a new Worker named `va-words-api`.
2. Replace the starter Worker with the contents of `worker.js` and deploy it.
3. In the Worker's **Settings > Variables and Secrets**, add an encrypted secret:
   - Name: `MW_LEARNERS_API_KEY`
   - Value: the Merriam-Webster Learner's Dictionary API key.
4. Copy the Worker URL, then set `apiBaseUrl` in `config.js` to that URL.

The key belongs only in Cloudflare's encrypted secret. Do not paste it into `config.js` or commit it to GitHub.

## Publish the page

Publish `index.html`, `app.js`, `styles.css`, and `config.js` with GitHub Pages. The intended URL is:

`https://norton-xu.github.io/personal-vocabulary-companion/`

Before publishing, edit `worker.js` if the final GitHub Pages origin is different from `https://norton-xu.github.io`.

## Review schedule

`Remembered` schedules the word after 3, 7, 14, 30, 60, then 120 days. `Again` returns it tomorrow.

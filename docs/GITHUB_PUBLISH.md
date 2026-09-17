# Publishing Kinetic Youth to GitHub

This repository is prepared so you can own the GitHub history yourself. The existing local commits already use your GitHub noreply identity.

## Create the repository

Create an empty repository in your GitHub account. Do not initialize it with a README, license, or `.gitignore`, because this project already has those files.

## Commit the presentation assets yourself

Review the working tree, then make the README and demo-script commit in your own terminal:

```bash
cd /Users/pranavreddyg/Documents/Codex/2026-09-07/ba/work/kinetic-youth
git status
git add README.md docs/DEMO_VIDEO.md docs/GITHUB_PUBLISH.md
git commit -m "docs: add GitHub project overview and demo guide"
```

Confirm the author before pushing:

```bash
git log -1 --format=fuller
```

It should show your name and your GitHub noreply email.

## Connect and push

Replace `YOUR_GITHUB_USERNAME` with your GitHub username and use the repository name you created:

```bash
git remote add github git@github.com:YOUR_GITHUB_USERNAME/kinetic-youth.git
git push -u github main
```

If you prefer HTTPS:

```bash
git remote add github https://github.com/YOUR_GITHUB_USERNAME/kinetic-youth.git
git push -u github main
```

GitHub may prompt you to authenticate. That is expected; do not paste an access token into a README, source file, or chat.

## Add the video

Record the 30-second walkthrough using [DEMO_VIDEO.md](DEMO_VIDEO.md). Upload the MP4 to a GitHub release or issue, copy its asset URL, then replace the demo placeholder in the root README and make a separate commit:

```bash
git add README.md
git commit -m "docs: add product walkthrough video"
git push
```

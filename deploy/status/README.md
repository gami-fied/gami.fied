# Status page

`status.gami.fied.cc` shows whether the website, the docs and the live demo are up, with their history. It runs on [Upptime](https://upptime.js.org): GitHub Actions check each address every five minutes, keep the results in a repository of their own, open an issue when something goes down, and publish the page with GitHub Pages. There are no servers to run.

The checks live in [`.upptimerc.yml`](.upptimerc.yml) here, so they are reviewed with the rest of the project. The status repository holds a copy.

## Set it up

1. Create a repository named `status` in the `gami-fied` organization from the [Upptime template](https://github.com/upptime/upptime/generate), with "Include all branches" ticked.
2. Replace its `.upptimerc.yml` with the one in this folder.
3. Add a secret named `GH_PAT` to that repository: a fine-grained token for the `status` repository with read and write access to contents, issues and workflows.
4. In its settings, turn on GitHub Pages from the `gh-pages` branch.
5. Point `status.gami.fied.cc` at GitHub Pages with a `CNAME` record to `gami-fied.github.io`.
6. Set the `STATUS_URL` variable in this repository to `https://status.gami.fied.cc`, so the website footer links to it.

The first checks run within five minutes, and the page is built after them.

## Add or change a check

Edit `.upptimerc.yml` here, then copy it into the status repository. Each site needs a `name` and a `url`. A check fails on any status other than 2xx, or when the response contains `__dangerous__body_down`.

When the Cloud edition launches (Phase 10), uncomment its checks.

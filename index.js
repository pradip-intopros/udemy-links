const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

(async () => {
    const siteUrl = 'https://studybullet.com/';

    const virtualConsole = new VirtualConsole();
    virtualConsole.on('error', () => {});
    virtualConsole.on('jsdomError', () => {});

    const stripHash = (url) => url.split('#')[0];
    const trimTrailingSlash = (url) => url.replace(/\/$/, '');

    const toAbsoluteUrl = (href, base) => {
        if (!href) return null;
        try {
            return new URL(href, base).toString();
        } catch {
            return null;
        }
    };

    const createDom = (html, url) => new JSDOM(html, { url, virtualConsole });

    const homepageHtml = await fetch(siteUrl).then((res) => res.text());

    const homepageDom = createDom(homepageHtml, siteUrl);
    const document = homepageDom.window.document;
    const content =
        document.querySelector('#content-wap > #primary.content-area') ||
        document.querySelector('#primary.content-area') ||
        document.querySelector('#primary') ||
        document.body;

    if (!content) {
        console.error('Could not find main content container in the page');
        return;
    }

    const courseLinks = [];
    const isCourseDetailUrl = (urlString) => {
        try {
            const parsed = new URL(urlString);
            const segments = parsed.pathname.split('/').filter(Boolean);
            return segments[0] === 'course' && segments[1] && segments[1] !== 'author';
        } catch {
            return false;
        }
    };

    const pushIfCourseUrl = (href) => {
        const absolute = toAbsoluteUrl(href, siteUrl);
        if (!absolute) return;
        if (!isCourseDetailUrl(absolute)) return;
        courseLinks.push(trimTrailingSlash(stripHash(absolute)));
    };

    content.querySelectorAll('a[href]').forEach((a) => pushIfCourseUrl(a.getAttribute('href')));
    document
        .querySelectorAll('ul li.srpw-li.srpw-clearfix a[href]')
        .forEach((a) => pushIfCourseUrl(a.getAttribute('href')));

    const uniqueCourseLinks = [...new Set(courseLinks)].sort();

    const udemyEnrollUrls = [];

    for (const pageUrl of uniqueCourseLinks) {
        const html = await fetch(pageUrl).then((res) => res.text());
        const dom = createDom(html, pageUrl);
        const enrollButtons = dom.window.document.querySelectorAll('a.enroll_btn[href]');

        enrollButtons.forEach((a) => {
            const enrollHref = a.getAttribute('href');
            const enrollUrl = toAbsoluteUrl(enrollHref, pageUrl);
            if (!enrollUrl) return;

            const hostname = (() => {
                try {
                    return new URL(enrollUrl).hostname.toLowerCase();
                } catch {
                    return '';
                }
            })();

            if (hostname === 'udemy.com' || hostname.endsWith('.udemy.com')) {
                udemyEnrollUrls.push(stripHash(enrollUrl));
            }
        });
    }

    const uniqueUdemyEnrollUrls = [...new Set(udemyEnrollUrls)].sort();
    fs.writeFileSync('enrollLinks.udemy.json', JSON.stringify(uniqueUdemyEnrollUrls, null, 2));
    console.log(`Udemy enroll links: ${uniqueUdemyEnrollUrls.length}`);
})()

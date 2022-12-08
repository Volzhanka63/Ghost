const {expect, test} = require('@playwright/test');
const {DateTime} = require('luxon');

const checkPostStatus = async (page, status, hoverStatus) => {
    await expect(page.locator('[data-test-editor-post-status]')).toContainText(status);

    if (hoverStatus) {
        await page.locator('[data-test-editor-post-status]').hover();
        await expect(page.locator('[data-test-editor-post-status]')).toContainText(hoverStatus);
    }
};

/**
 * Start a post draft with a filled in title and body. We can consider to move this to utils later.
 * @param {import('@playwright/test').Page} page
 * @param {Object} options
 * @param {String} [options.title]
 * @param {String} [options.body]
 */
const createPost = async (page, {title = 'Hello world', body = 'This is my post body.'} = {}) => {
    await page.locator('.gh-nav a[href="#/posts/"]').click();

    // Create a new post
    await page.locator('[data-test-new-post-button]').click();

    // Fill in the post title
    await page.locator('[data-test-editor-title-input]').click();
    await page.locator('[data-test-editor-title-input]').fill(title);

    // Continue to the body by pressing enter
    await page.keyboard.press('Enter');

    await page.waitForTimeout(100); // allow new->draft switch to occur fully, without this some initial typing events can be missed
    await page.keyboard.type(body);
};

/**
 * Start a page draft with a filled in title and body. We can consider to move this to utils later.
 * @param {import('@playwright/test').Page} page
 * @param {Object} options
 * @param {String} [options.title]
 * @param {String} [options.body]
 */
const createPage = async (page, {title = 'Hello world', body = 'This is my post body.'} = {}) => {
    await page.locator('.gh-nav a[href="#/pages/"]').click();

    // Create a new post
    await page.locator('[data-test-new-page-button]').click();

    // Fill in the post title
    await page.locator('[data-test-editor-title-input]').click();
    await page.locator('[data-test-editor-title-input]').fill(title);

    // Continue to the body by pressing enter
    await page.keyboard.press('Enter');

    await page.waitForTimeout(100); // allow new->draft switch to occur fully, without this some initial typing events can be missed
    await page.keyboard.type(body);
};

/**
 * @param {import('@playwright/test').Page} page
 */
const openPublishFlow = async (page) => {
    await page.locator('[data-test-button="publish-flow"]').click();
};

/**
 * @param {import('@playwright/test').Page} page
 */
const closePublishFlow = async (page) => {
    await page.locator('[data-test-button="close-publish-flow"]').click();
};

/**
 * @typedef {Object} PublishOptions
 * @property {'publish'|'publish+send'|'send'|null} [type]
 * @property {String} [recipientFilter]
 * @property {String} [newsletter]
 * @property {String} [date]
 * @property {String} [time]
 */

/**
 * Open and complete publish flow, filling in all necessary fields based on publish options
 * @param {import('@playwright/test').Page} page
 * @param {PublishOptions} options
 */
const publishPost = async (page, {type = 'publish', time, date} = {}) => {
    await openPublishFlow(page);

    // set the publish type
    if (type) {
        // Type is nullable because Pages don't have a publish type button

        await page.locator('[data-test-setting="publish-type"] > button').click();

        // NOTE: the if/else below should be reworked into data-test-publish style selectors
        // await page.locator(`[data-test-publish-type="${type}"]`).setChecked(true);
        if (type === 'publish') {
            await page.getByText('Publish only').click();
        } else if (type === 'publish+send') {
            await page.getByText('Publish and email').click();
        } else if (type === 'send') {
            await page.getByText('Email only').click();
        }
    }

    // Schedule the post
    if (date || time) {
        await page.locator('[data-test-setting="publish-at"] > button').click();
        await page.locator('[data-test-radio="schedule"] + label').click();
    }

    if (date) {
        await page.locator('[data-test-date-time-picker-date-input]').fill(date);
    }

    if (time) {
        await page.locator('[data-test-date-time-picker-time-input]').fill(time);
    }

    // TODO: set other publish options

    // continue to confirmation step
    await page.locator('[data-test-modal="publish-flow"] [data-test-button="continue"]').click();

    // TODO: assert publish flow has expected confirmation details

    // (we need force because the button is animating)
    await page.locator('[data-test-modal="publish-flow"] [data-test-button="confirm-publish"]').click({force: true});

    // TODO: assert publish flow has expected completion details

    // open the published post in a new tab
    const [frontendPage] = await Promise.all([
        page.waitForEvent('popup'),
        page.locator('[data-test-complete-bookmark]').click()
    ]);

    await closePublishFlow(page);
    return frontendPage;
};

test.describe('Publishing', () => {
    test.describe('Publish post', () => {
        test('Post should only be available on web', async ({page}) => {
            await page.goto('/ghost');
            await createPost(page);
            const frontendPage = await publishPost(page);
            await checkPostStatus(page, 'Published');

            // Check if 'This is my post body.' is present on page1
            await expect(frontendPage.locator('.gh-canvas .article-title')).toHaveText('Hello world');
            await expect(frontendPage.locator('.gh-content.gh-canvas > p')).toHaveText('This is my post body.');
        });
    });

    test.describe('Publish page', () => {
        test('Page can be published and become visible on web', async ({page}) => {
            await page.goto('/ghost');
            await createPage(page);
            const frontendPage = await publishPost(page, {type: null});
            await checkPostStatus(page, 'Published');

            // Check if 'This is my post body.' is present on page1
            await expect(frontendPage.locator('.gh-canvas .article-title')).toHaveText('Hello world');
            await expect(frontendPage.locator('.gh-content.gh-canvas > p')).toHaveText('This is my post body.');
        });
    });

    test.describe('Update post', () => {
        test('Can update a published post', async ({page: adminPage, browser}) => {
            await adminPage.goto('/ghost');

            const date = DateTime.now();

            await createPost(adminPage, {title: 'Testing publish update', body: 'This is the initial published text.'});
            const frontendPage = await publishPost(adminPage);
            await frontendPage.pause();
            const frontendBody = frontendPage.locator('main > article > section > p');
            const frontendHeader = frontendPage.locator('main > article > header');

            // check front-end post has the initial body text
            await expect(frontendBody).toContainText('This is the initial published text.');
            await expect(frontendHeader).toContainText(date.toFormat('LLL d, yyyy'));

            // add some extra text to the post
            await adminPage.locator('[data-kg="editor"]').click();
            await adminPage.waitForTimeout(200); //
            await adminPage.keyboard.type(' This is some updated text.');

            // change some post settings
            await adminPage.locator('[data-test-psm-trigger]').click();
            await adminPage.fill('[data-test-date-time-picker-date-input]', '2022-01-07');
            await adminPage.fill('[data-test-field="custom-excerpt"]', 'Short description and meta');

            // save
            await adminPage.locator('[data-test-button="publish-save"]').click();

            // check front-end has new text after reloading
            await frontendPage.waitForTimeout(300); // let save go through
            await frontendPage.reload();
            await expect(frontendBody).toContainText('This is some updated text.');
            await expect(frontendHeader).toContainText('Jan 7, 2022');
            const metaDescription = frontendPage.locator('meta[name="description"]');
            await expect(metaDescription).toHaveAttribute('content', 'Short description and meta');
        });
    });

    test.describe('Schedule post', () => {
        test('Post should be published to web only at the scheduled time', async ({page}) => {
            await page.goto('/ghost');
            await createPost(page, {
                title: 'Scheduled post test',
                body: 'This is my scheduled post body.'
            });

            // Schedule the post to publish asap (by setting it to 00:00, it will get auto corrected to the minimum time possible - 5 seconds in the future)
            await publishPost(page, {time: '00:00'});
            await checkPostStatus(page, 'Scheduled', 'Scheduled to be published in a few seconds');

            // Go to the homepage and check if the post is not yet visible there
            await page.goto('/');

            let lastPost = await page.locator('.post-card-content-link').first();
            await expect(lastPost).not.toHaveAttribute('href', '/scheduled-post-test/');

            // Now wait for 5 seconds
            await page.waitForTimeout(5000);

            // Check again, now it should have been added to the page
            await page.reload();
            lastPost = await page.locator('.post-card-content-link').first();
            await expect(lastPost).toHaveAttribute('href', '/scheduled-post-test/');

            // Go to the page
            await lastPost.click();

            // Check if the title and body are present on this page
            await expect(page.locator('.gh-canvas .article-title')).toHaveText('Scheduled post test');
            await expect(page.locator('.gh-content.gh-canvas > p')).toHaveText('This is my scheduled post body.');
        });

        test('A previously scheduled post can be unscheduled, which resets it to a draft', async ({page, context}) => {
            await page.goto('/ghost');
            await createPost(page, {
                title: 'Unschedule post test',
                body: 'This is my unscheduled post body.'
            });

            // Schedule far in the future
            await publishPost(page, {date: '2050-01-01', time: '10:09'});

            // Check status
            await checkPostStatus(page, 'Scheduled', 'Scheduled to be published at 10:09 (UTC) on 01 Jan 2050');

            // Check not published
            const testPage = await context.newPage();
            const response = await testPage.goto('/unschedule-post-test/');
            expect(response.status()).toBe(404);

            await page.pause();

            // Now unschedule this post
            await page.locator('[data-test-button="update-flow"]').click();
            await page.locator('[data-test-button="revert-to-draft"]').click();

            // Check status
            await checkPostStatus(page, 'Draft - Saved');

            // Check not published
            const response2 = await testPage.goto('/unschedule-post-test/');
            expect(response2.status()).toBe(404);
        });
    });

    test.describe('Schedule page', () => {
        test('Page should be published at the scheduled time', async ({page}) => {
            await page.goto('/ghost');
            await createPage(page, {
                title: 'Scheduled page test',
                body: 'This is my scheduled page body.'
            });

            // Schedule the post to publish asap (by setting it to 00:00, it will get auto corrected to the minimum time possible - 5 seconds in the future)
            await publishPost(page, {time: '00:00', type: null});
            await checkPostStatus(page, 'Scheduled', 'Scheduled to be published in a few seconds');

            // Go to the page and check if the status code is 404
            const response = await page.goto('/scheduled-page-test/');
            expect(response.status()).toBe(404);

            // Now wait for 5 seconds
            await page.waitForTimeout(5000);

            // Check again, now it should have been added to the page
            await page.reload();

            // Check if the title and body are present on this page
            await expect(page.locator('.gh-canvas .article-title')).toHaveText('Scheduled page test');
            await expect(page.locator('.gh-content.gh-canvas > p')).toHaveText('This is my scheduled page body.');
        });
    });
});

test.describe('Updating post access', () => {
    test.describe('Change post visibility to members-only', () => {
        test('Only logged-in members (free or paid) can see', async ({page}) => {
            await page.goto('/ghost');

            // Create a post
            await createPost(page);

            // Open the Post Settings Menu
            await page.locator('[data-test-psm-trigger]').click();

            // Change the Post access setting to 'Members only'
            await page.locator('[data-test-select="post-visibility"]').selectOption('members');

            // Publish the post
            const frontendPage = await publishPost(page);

            // Check if content gate for members is present on front-end
            await expect(frontendPage.locator('.gh-post-upgrade-cta-content h2')).toHaveText('This post is for subscribers only');
        });
    });

    test.describe('Change post visibility to paid-members-only', () => {
        test('Only logged-in, paid members can see', async ({page}) => {
            await page.goto('/ghost');

            // Create a post
            await createPost(page);

            // Open the Post Settings Menu
            await page.locator('[data-test-psm-trigger]').click();

            // Change the Post access setting to 'Paid-members only'
            await page.locator('[data-test-select="post-visibility"]').selectOption('paid');

            // Publish the post
            const frontendPage = await publishPost(page);

            // Check if content gate for paid members is present on front-end
            await expect(frontendPage.locator('.gh-post-upgrade-cta-content h2')).toHaveText('This post is for paying subscribers only');
        });
    });

    test.describe('Change post visibility to public', () => {
        test('Everyone can see', async ({page}) => {
            await page.goto('/ghost');

            // Create a post
            await createPost(page);

            // Open the Post Settings Menu
            await page.locator('[data-test-psm-trigger]').click();

            // Change the Post access setting to 'Public'
            await page.locator('[data-test-select="post-visibility"]').selectOption('public');

            // Publish the post
            const frontendPage = await publishPost(page);

            // Check if post content is publicly visible on front-end
            await expect(frontendPage.locator('.gh-content.gh-canvas > p')).toHaveText('This is my post body.');
        });
    });
});

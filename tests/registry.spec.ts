import { test, expect } from '@playwright/test';
import { v1 as uuid } from 'uuid';
import * as fs from 'fs';

const USERNAME = process.env.TEST_USERNAME!;
const PASSWORD = process.env.TEST_PASSWORD!;

const REGISTRY_CREATION_DELETION_TIMEOUT = 20000;

const TEST_UUID = uuid();

const login = async function (page) {
  await page.goto(
    'http://apicurio-registry-mt-ui-mt-apicurio-apicurio-registry.apps.smaug.na.operate-first.cloud'
  );

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Sign in to operate-first-apicurio/);

  // do login
  await page.locator('#username').fill(USERNAME);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#kc-login').click();

  // check we landed on Registry
  await expect(page).toHaveTitle(/Apicurio : Registry/);
};

const createRegistryInstance = async function (page, name) {
  await page.getByText('Create registry instance', { exact: true }).click();

  await page.locator('#create-instance-name').fill(name);
  await page.getByText('Create', { exact: true }).click();

  // waiting to have the instance ready
  const instanceLinkSelector = page.getByRole('link', { name: `${name}` });
  await expect(instanceLinkSelector).toBeEnabled({
    timeout: REGISTRY_CREATION_DELETION_TIMEOUT
  });
};

const deleteRegistryInstance = async function (page, name) {
  const instanceLinkSelector = page.getByRole('link', { name: `${name}` });
  const row = page.locator('tr', { has: instanceLinkSelector });
  await row.getByRole('button', { name: 'Actions' }).click();

  // Delete the created registry
  await row.getByText('Delete', { exact: true }).click();

  await page.locator('#delete-instance-verify-name').fill(name);
  await page.locator('#delete-instance-verify-check').check();

  const deleteLocator = page.getByText('Delete', { exact: true });
  await expect(deleteLocator).toBeEnabled();
  await deleteLocator.click();

  // await for the instance to be deleted
  await expect(page.getByText(`${name}`, { exact: true })).toHaveCount(0, {
    timeout: REGISTRY_CREATION_DELETION_TIMEOUT
  });
};

test('clean existing registry instances', async ({ page }) => {
  await login(page);

  await expect(page.getByText('Create registry instance')).toBeEnabled();

  for (const el of await page.locator(`tr >> a`).elementHandles()) {
    const name = await el.textContent();
    await deleteRegistryInstance(page, name);
  }
});

test('create a registry instance and delete it', async ({ page }) => {
  await login(page);

  const testInstanceName = `test-instance-${TEST_UUID}`.substring(0, 32);

  await createRegistryInstance(page, testInstanceName);

  await deleteRegistryInstance(page, testInstanceName);
});

test('create a registry instance create an artifact and delete everything', async ({
  page,
  browserName
}) => {
  test.skip(
    (browserName === 'webkit' || browserName === 'firefox') &&
      process.platform === 'darwin',
    'The artifact content is pasted with spurious characters'
  );

  await login(page);

  const testInstanceName = `test-instance-${TEST_UUID}`.substring(0, 32);

  await createRegistryInstance(page, testInstanceName);

  await page.getByRole('link', { name: `${testInstanceName}` }).click();

  const uploadButtonLocator = page
    .getByText('Upload artifact', { exact: true })
    .first();

  await expect(uploadButtonLocator)
    .toBeEnabled()
    .catch((err) => {
      page.getByText('Reload page', { exact: true }).first().click();
    });

  await expect(uploadButtonLocator).toBeEnabled({ timeout: 10000 });
  await uploadButtonLocator.click();

  const artifactContent = fs.readFileSync('./resources/petstore.yaml', {
    encoding: 'utf-8'
  });

  // FIXME: fails on Safari
  await page.locator('#artifact-content').fill(artifactContent);

  // FIXME: otherwise the Upload doesn't work -> get stuck on a loading page
  await new Promise((resolve) => setTimeout(resolve, 300));

  const uploadLocator = page.getByText('Upload', { exact: true });
  await expect(uploadLocator).toBeEnabled({ timeout: 10000 });
  await uploadLocator.click();

  await expect(page.locator('h1 >> text="Swagger Petstore"')).toHaveCount(1, {
    timeout: 10000
  });

  await page.locator(`a >> text="Registry Instances"`).click();

  await deleteRegistryInstance(page, testInstanceName);
});

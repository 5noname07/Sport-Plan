import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/?demo=1');
  await expect(page.getByRole('heading', { name: '当天营养进度' })).toBeVisible();
});
test('训练逐组录入、复制、保存、修改和删除', async ({ page }) => {
  await page.getByRole('button', { name: '＋ 记录训练', exact: true }).click();
  await page.getByLabel('卧推第1组重量').fill('');
  await expect(page.getByLabel('卧推第1组重量')).toHaveValue('');
  await page.getByLabel('卧推第1组重量').fill('60');
  await page.getByLabel('卧推第1组次数').fill('12');
  await page.getByLabel('卧推第2组重量').fill('65');
  await page.getByLabel('卧推第2组次数').fill('10');
  await page.getByRole('button', { name: '＋ 下一组（复制上一组）' }).click();
  await expect(page.getByLabel('卧推第3组重量')).toHaveValue('65');
  await expect(page.getByLabel('卧推第3组次数')).toHaveValue('10');
  await page.getByLabel('卧推第3组重量').fill('70');
  await page.getByLabel('卧推第3组次数').fill('8');
  await page.getByRole('button', { name: '保存训练', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('训练已保存');
  await page.getByRole('navigation').getByRole('button', { name: '首页' }).click();
  await expect(
    page
      .locator('.stat')
      .filter({ has: page.getByText('训练容量', { exact: true }) })
      .locator('strong'),
  ).toHaveText('1,930 kg');
  await page.getByRole('button', { name: '查看 / 修改训练' }).click();
  await page.getByLabel('卧推第3组次数').fill('9');
  await page.getByRole('button', { name: '保存训练', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('训练已保存');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '删除当天训练' }).click();
  await expect(page.getByRole('status')).toHaveText('训练已删除');
  await expect(page.getByText('从下面选择一个动作，开始记录今天的第一组。')).toBeVisible();
});
test('食品和饮食 CRUD，食品修改保留历史营养', async ({ page }) => {
  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: '食品库', exact: true }).click();
  await page.getByLabel('食品名称').fill('测试酸奶');
  await page.getByLabel('热量（kcal）', { exact: true }).fill('100');
  await page.getByLabel('蛋白质（g）', { exact: true }).fill('10');
  await page.getByLabel('碳水（g）', { exact: true }).fill('12');
  await page.getByLabel('脂肪（g）', { exact: true }).fill('3');
  await page.getByRole('button', { name: '添加食品', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('食品已保存');
  await nav.getByRole('button', { name: '饮食', exact: true }).click();
  await page.getByLabel('选择食品').selectOption({ label: '测试酸奶' });
  await page.getByLabel('实际食用重量（g）').fill('200');
  await expect(
    page.getByText('200 kcal · 蛋白质 20 g · 碳水 24 g · 脂肪 6 g', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '保存饮食', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('饮食已保存');
  await nav.getByRole('button', { name: '食品库', exact: true }).click();
  await page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: '测试酸奶', exact: true }) })
    .getByRole('button', { name: '编辑' })
    .click();
  await page.getByLabel('蛋白质（g）', { exact: true }).fill('5');
  await page.getByRole('button', { name: '保存食品修改' }).click();
  await expect(page.getByRole('status')).toHaveText('食品已保存');
  await nav.getByRole('button', { name: '饮食', exact: true }).click();
  const entry = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: /测试酸奶/ }) });
  await expect(entry).toContainText('蛋白质 20 g');
  await entry.getByRole('button', { name: '修改' }).click();
  await page.getByLabel('实际食用重量（g）').fill('100');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('饮食已保存');
  await expect(entry).toContainText('蛋白质 10 g');
  page.once('dialog', (d) => d.accept());
  await entry.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('饮食已删除');
  await nav.getByRole('button', { name: '食品库', exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: '测试酸奶', exact: true }) })
    .getByRole('button', { name: '删除' })
    .click();
  await expect(page.getByRole('status')).toHaveText('食品已归档');
  await expect(page.getByRole('heading', { name: '测试酸奶', exact: true })).toHaveCount(0);
});
test('全部页面无水平溢出，趋势四指标正常，体重与动作可维护', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const nav = page.getByRole('navigation');
  for (const name of ['首页', '训练', '饮食', '食品库', '历史', '趋势', '设置']) {
    await nav.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.topbar h2')).toHaveText(name);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    if (name === '趋势') {
      for (const label of [
        '最大训练重量（kg）',
        '总组数（组）',
        '总次数（次）',
        '训练容量（kg）',
      ]) {
        await page.getByLabel('趋势指标').selectOption({ label });
        await expect(
          page.getByRole('img', { name: label.replace(/（.+）/, '') + '折线图' }),
        ).toBeVisible();
      }
    }
  }
  await page.getByLabel('年龄（岁）').fill('29');
  await page.getByRole('button', { name: '保存个人信息' }).click();
  await expect(page.getByRole('status')).toHaveText('个人信息已保存');
  await page.getByLabel('体重（kg）').fill('71');
  await page.getByRole('button', { name: '保存体重', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('体重已保存');
  await page.getByLabel('动作名称').fill('测试划船');
  await page.getByRole('button', { name: '添加动作', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('动作已保存');
  const record = page
    .locator('.record')
    .filter({ has: page.getByText('测试划船', { exact: true }) });
  page.once('dialog', (d) => d.accept());
  await record.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('动作已归档');
  expect(errors).toEqual([]);
  await nav.getByRole('button', { name: '首页', exact: true }).click();
  await page.screenshot({ path: `test-results/${testInfo.project.name}-home.png`, fullPage: true });
});
test('未保存训练切换页面会询问，取消后保留输入', async ({ page }) => {
  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: '训练', exact: true }).click();
  await page.getByLabel('卧推第1组重量').fill('77.5');
  page.once('dialog', (d) => d.dismiss());
  await nav.getByRole('button', { name: '历史', exact: true }).click();
  await expect(page.getByLabel('卧推第1组重量')).toHaveValue('77.5');
  page.once('dialog', (d) => d.accept());
  await nav.getByRole('button', { name: '历史', exact: true }).click();
  await expect(page.locator('.topbar h2')).toHaveText('历史');
});
test('PWA 图标与离线提示可用，离线重新打开不显示旧个人记录', async ({ page, context }) => {
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).status()).toBe(200);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: '当天营养进度' })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: '暂时没有网络' })).toBeVisible();
  await expect(page.getByText('当天营养进度')).toHaveCount(0);
});

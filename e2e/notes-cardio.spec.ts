import { expect, test, type Page } from '@playwright/test';
const nav = (page: Page, name: string) =>
  page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
test.beforeEach(async ({ page }) => {
  // LAN HTTP lacks randomUUID. New records must still work during phone testing.
  await page.addInitScript(() => {
    Object.defineProperty(window.crypto, 'randomUUID', { value: undefined });
  });
  await page.goto('/?demo=1');
  await expect(page.getByRole('heading', { name: '当天营养进度' })).toBeVisible();
});
test('动作备注跨训练日共享，整体备注独立，专区编辑与训练同步', async ({ page }) => {
  await nav(page, '训练');
  const weight = await page.getByLabel('卧推第1组重量').inputValue();
  await page.getByLabel('训练备注', { exact: true }).fill('今天力量状态良好');
  await page.getByRole('button', { name: '保存训练', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('训练已保存');
  await page.getByText('卧推 · 动作备注（尚未填写，可直接添加）', { exact: true }).click();
  await page.getByLabel('卧推的动作备注').fill('肩胛收紧\n双脚稳定');
  await page.getByRole('button', { name: '保存动作备注', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('动作备注已保存');
  await expect(page.getByLabel('训练备注', { exact: true })).toHaveValue('今天力量状态良好');
  await expect(page.getByLabel('卧推第1组重量')).toHaveValue(weight);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.getByLabel('卧推的动作备注')).toHaveValue('肩胛收紧\n双脚稳定');
  const today = await page.getByLabel('记录日期', { exact: true }).inputValue();
  await page.getByLabel('记录日期', { exact: true }).fill('2026-01-02');
  await page.getByLabel('选择动作', { exact: true }).selectOption({ label: '卧推' });
  await page.getByText('卧推 · 动作备注', { exact: true }).click();
  await expect(page.getByLabel('卧推的动作备注')).toHaveValue('肩胛收紧\n双脚稳定');
  await page.getByLabel('记录日期', { exact: true }).fill(today);
  await nav(page, '训练备注');
  const note = page.locator('.training-note').filter({ hasText: '力量训练' });
  await note.locator('summary').click();
  await expect(note).toContainText('今天力量状态良好');
  await note.getByRole('button', { name: '编辑整体备注' }).click();
  await page.getByLabel('训练整体备注', { exact: true }).fill('专区回写：下次注意休息');
  await page.getByRole('button', { name: '保存训练备注', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('训练备注已保存');
  await note.getByRole('button', { name: '打开对应训练' }).click();
  await expect(page.getByLabel('训练备注', { exact: true })).toHaveValue('专区回写：下次注意休息');
  await expect(page.getByLabel('卧推第1组重量')).toHaveValue(weight);
});
test('同日多条有氧独立记录，专区按 ID 回写，营养随增删改更新', async ({ page }, info) => {
  const getTarget = () =>
    page
      .locator('.stat')
      .filter({ has: page.getByText('建议热量', { exact: true }) })
      .locator('strong')
      .innerText();
  const baseline = await getTarget();
  await nav(page, '有氧');
  await page.getByLabel('开始时间（可选）').fill('08:00');
  await page.getByLabel('运动时长（分钟，可选）').fill('30');
  await page.getByLabel('距离（km，可选）').fill('5');
  await page.getByLabel('有氧运动备注', { exact: true }).fill('晨跑记录');
  await page.getByRole('button', { name: '保存有氧训练', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('有氧训练已保存');
  await page.getByLabel('有氧类型').selectOption('cycling');
  await page.getByLabel('开始时间（可选）').fill('18:00');
  await page.getByLabel('运动时长（分钟，可选）').fill('20');
  await page.getByLabel('距离（km，可选）').fill('4');
  await page.getByLabel('有氧运动备注', { exact: true }).fill('傍晚骑行记录');
  await page.getByRole('button', { name: '保存有氧训练', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('有氧训练已保存');
  await nav(page, '首页');
  await expect(page.locator('.nutrition-explanation')).toContainText('力量 1 次 · 有氧 2 次');
  const added = await getTarget();
  expect(added).not.toBe(baseline);
  await nav(page, '训练备注');
  const run = page.locator('.training-note').filter({ hasText: '有氧 · 跑步' });
  await run.locator('summary').click();
  await run.getByRole('button', { name: '编辑整体备注' }).click();
  await page.getByLabel('训练整体备注', { exact: true }).fill('仅修改晨跑');
  await page.getByRole('button', { name: '保存训练备注', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('训练备注已保存');
  await run.getByRole('button', { name: '打开对应训练' }).click();
  await expect(page.getByLabel('有氧运动备注', { exact: true })).toHaveValue('仅修改晨跑');
  await page.getByLabel('运动时长（分钟，可选）').fill('60');
  await page.getByRole('button', { name: '保存有氧修改', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('有氧训练已保存');
  await nav(page, '首页');
  expect(await getTarget()).not.toBe(added);
  await nav(page, '有氧');
  const day = page
    .locator('section.card')
    .filter({ has: page.getByRole('heading', { name: /当天有氧/ }) });
  const runRow = day.locator('article').filter({ hasText: '仅修改晨跑' });
  await expect(day.locator('article').filter({ hasText: '傍晚骑行记录' })).toHaveCount(1);
  page.once('dialog', (d) => d.accept());
  await runRow.getByRole('button', { name: '删除有氧' }).click();
  await expect(page.getByRole('status')).toHaveText('有氧训练已删除');
  await expect(day.locator('article')).toHaveCount(1);
  await nav(page, '首页');
  await expect(page.locator('.nutrition-explanation')).toContainText('有氧 1 次');
  await nav(page, '有氧');
  page.once('dialog', (d) => d.accept());
  await day.getByRole('button', { name: '删除有氧' }).click();
  await expect(page.getByRole('status')).toHaveText('有氧训练已删除');
  await nav(page, '首页');
  expect(await getTarget()).toBe(baseline);
  await page.screenshot({
    path: `test-results/${info.project.name}-updated-home.png`,
    fullPage: true,
  });
});
test('只有有氧、缺失时长与不适用距离的字段可以保存，历史和趋势可见', async ({ page }, info) => {
  await page.getByLabel('记录日期', { exact: true }).fill('2026-01-02');
  await nav(page, '有氧');
  await page.getByLabel('有氧类型').selectOption('elliptical');
  await expect(page.getByLabel('距离（km，可选）')).toHaveCount(0);
  await page.getByLabel('有氧运动备注', { exact: true }).fill('只有有氧，无时长');
  await page.getByRole('button', { name: '保存有氧训练', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('有氧训练已保存');
  await nav(page, '训练');
  await expect(page.getByText('从下面选择一个动作，开始记录今天的第一组。')).toBeVisible();
  await nav(page, '历史');
  await expect(page.getByRole('heading', { name: '有氧训练详情' })).toBeVisible();
  await expect(page.getByText('只有有氧，无时长')).toBeVisible();
  await nav(page, '有氧');
  const day = page
    .locator('section.card')
    .filter({ has: page.getByRole('heading', { name: /当天有氧/ }) });
  await day.getByRole('button', { name: '编辑有氧' }).click();
  await page.getByLabel('运动时长（分钟，可选）').fill('20');
  await page.getByRole('button', { name: '保存有氧修改', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('有氧训练已保存');
  await nav(page, '趋势');
  await page.getByLabel('起始日期', { exact: true }).fill('2026-01-01');
  await page.getByLabel('结束日期', { exact: true }).fill('2026-01-03');
  await expect(page.getByRole('img', { name: '有氧总时长折线图' })).toBeVisible();
  await nav(page, '有氧');
  await page.screenshot({ path: `test-results/${info.project.name}-cardio.png`, fullPage: true });
});

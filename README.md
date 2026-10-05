# Sport Plan

供个人长期使用的力量训练与饮食手账。响应式 Web / PWA，Windows 和手机访问同一站点、登录同一账号，数据保存在 Supabase PostgreSQL。没有注册、社交、AI 教练、商业化或后台管理功能。

## 已实现

- 每日多个动作，每组独立 kg / 次数；训练新增、编辑、删除。
- 动作库、复制上一组、参考及沿用上次训练；已使用动作归档后保留历史。
- 按动作与日期范围查看最大重量、组数、总次数、训练容量折线图。
- 身高、年龄、性别、活动水平配置；体重历史的增删改与趋势。
- 食品库新增、编辑、搜索、删除；按实际食用 g 自动换算饮食营养。
- 饮食新增、修改重量、删除；热量、蛋白质、碳水、脂肪汇总与进度条。
- 基于 BMR、活动水平、实际训练时长的营养估算；参数集中管理。
- 首页快捷录入、日期历史、手机底部导航、深浅色、PWA、JSON 导出。
- 邮箱密码登录、数据库 RLS、训练事务及版本冲突保护、保存失败提示。

**交付状态：代码可构建、可预览；正式使用需由项目所有者创建 Supabase 项目并部署前端。未配置时可打开明确标记的临时预览，示例数据只在内存，刷新后重置。真实云端登录与两端同步需接入项目后验收。**

## 技术与目录

React 19 + TypeScript + Vite；Recharts；Supabase JS + PostgreSQL + Auth。静态前端直接通过有 RLS 的 API 访问数据库；完整训练事务与饮食换算由数据库函数完成，无额外应用服务器。

```text
src/
  App.tsx                  登录、导航、同步、错误状态
  components/              表单与营养进度共用展示
  data/                    Supabase 客户端、统一数据访问、独立预览实现
  domain/                  类型、业务计算、营养参数
  pages/                   首页、训练、饮食、食品库、历史、趋势、设置
public/                    PWA、图标、离线提示
supabase/migrations/       数据库初始化 SQL
tests/                     核心计算与 PostgreSQL 事务/RLS 测试
e2e/                       桌面和手机浏览器流程
scripts/                   Windows 图标生成与浏览器诊断工具
```

## 数据库模型

所有业务表带 `user_id`，只允许登录身份访问自己的行；子表复合外键保证父记录属于同一身份。公开注册必须关闭，只在后台创建一个个人账号。RLS 用于保护公开 Web API 的数据，不是多用户管理功能。

| 表                  | 用途与关系                                           |
| ------------------- | ---------------------------------------------------- |
| `profiles`          | 身高、年龄、性别、活动系数、营养参数，关联 Auth 身份 |
| `body_records`      | 每日体重，每人每天一条                               |
| `exercises`         | 个人动作库与归档标记                                 |
| `workouts`          | 每日训练、实际时长、备注、版本，每人每天一条         |
| `workout_exercises` | 每日训练的多个动作与顺序                             |
| `training_sets`     | 每个动作多组独立重量、次数、顺序                     |
| `foods`             | 食品、基准 g、基准营养、归档标记                     |
| `meal_days`         | 每日饮食记录，每人每天一条                           |
| `meal_entries`      | 食品、实际 g、录入时名称与营养快照                   |

`save_workout` 的 JSON 只作事务传输参数，最终拆成动作/组的独立行；数据库没有用 JSON 存训练。失败整体回滚，同日创建串行化，过期版本修改被拒绝。删除训练级联删除关联组。

食品/动作“删除”采用归档，不破坏历史。修改食品不改变历史摄入，历史饮食修改重量沿用原营养比例。训练、饮食条目与体重的真实删除不可撤销，界面要求确认。

## 本地运行

建议 Node.js 24 LTS、Git。使用锁文件 `npm ci`，不需要本地 PostgreSQL。

```powershell
git clone https://github.com/5noname07/Sport-Plan.git
cd Sport-Plan
npm ci
Copy-Item .env.example .env
# 填写 .env 后启动；也可以暂不填写，体验临时预览
npm run dev
```

打开终端显示地址，通常 `http://localhost:5173`。无配置时点击“打开临时功能预览”。正式记录不要使用带 `?demo=1` 的地址。

```powershell
npm test           # 计算 + 数据库事务 / RLS / CRUD
npm run build     # TypeScript 检查 + 生产构建
npm run preview   # 查看生产版本，通常端口 4173
npm run test:e2e  # 桌面/手机完整录入与修改删除；先 build
```

浏览器测试默认使用已安装的 Microsoft Edge。没有 Edge 时，可在 `playwright.config.ts` 改用已安装的 Chrome，或运行 `npx playwright install chromium` 并移除 `channel`。浏览器测试使用内存预览；数据库测试用 PGlite 中的真实 PostgreSQL 引擎和模拟 `auth.uid()`，执行生产迁移。这不验证真实 Supabase Auth 与部署，需要完成下方云端同步验收。

## Supabase 初始化

1. 在 [Supabase 后台](https://supabase.com/dashboard) 创建项目，选合适区域。数据库密码自行保存在密码管理器，不提交仓库。
2. 在 **SQL Editor** 执行 `supabase/migrations/001_initial.sql` 全文一次。
3. 在 **Authentication → Users** 添加你的邮箱密码账号，确保邮箱已确认。没有注册页，不需要自建邮件发送服务。
4. 在 Authentication 配置关闭 **Allow new users to sign up**，关闭匿名登录，只保留邮箱密码登录。账号管理在后台进行。
5. 在 Connect / Settings → API Keys 查找项目 URL 与 **publishable key**（`sb_publishable_...`）；旧版 `anon` 公共密钥也可用。
6. 填好本地 `.env`，重启 Vite，登录后先设置身体信息和体重，再添加动作与食品。

迁移用于新项目，不能重复执行。不要对真实数据删表重建。后续变化增加新编号迁移；首次保存个人信息自动创建 profile。

### 环境变量

| 变量                            | 用途                                   |
| ------------------------------- | -------------------------------------- |
| `VITE_SUPABASE_URL`             | 项目 HTTPS URL                         |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 浏览器公开 publishable 或旧版 anon key |

`VITE_` 值会打包进浏览器。这两个是公开连接配置，安全边界为 JWT + RLS。**禁止使用 secret / service_role 密钥、数据库密码、Access Token。** `.env` 已忽略，仅提交 `.env.example`。浏览器会保存登录会话令牌和主题偏好，核心记录不在 localStorage。

参考：[公共密钥说明](https://supabase.com/docs/guides/getting-started/api-keys)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)。

## 部署

前端可部署到支持 HTTPS 的静态托管平台，无 Node 后端。以 [Vercel 的 Vite 部署](https://vercel.com/docs/frameworks/frontend/vite)为例：

1. 在自己的 Vercel 账号导入 GitHub `5noname07/Sport-Plan`，部署分支 `main`。
2. Framework Vite；安装 `npm ci`；Build `npm run build`；Output `dist`；Node 24。
3. 添加两个环境变量，生产/预览环境按需填写。
4. 部署后在 Supabase Auth URL Configuration 将 Site URL 填为最终 HTTPS 域名。
5. 手机和电脑打开同一地址、同一邮箱密码登录。更改环境变量后重新部署。

当前页面用状态切换，不需要 SPA rewrite。manifest/SW 使用根路径，部署到域名根目录；GitHub Pages 的 `/Sport-Plan/` 子路径当前不支持。

无需购买域名或主动开通付费方案。创建时核对服务额度：[Supabase 当前 Free](https://supabase.com/pricing)含 500 MB 数据库，通常足够单人文本记录；**一周不活跃可能暂停，不包含自动数据库备份**。暂停需后台恢复，免费服务不是永久备份承诺。

## 手机与 PWA

- iPhone：Safari 打开 HTTPS 地址 → 分享 → 添加到主屏幕。
- Android：Chrome/Edge 菜单 → 安装应用 / 添加到主屏幕。
- Windows：Edge/Chrome 地址栏安装图标或应用安装菜单。

PWA 提供图标和独立窗口，不支持离线写入。已有页面离线时显示已加载数据、保留训练输入；恢复网络后重试。离线重新打开显示离线提示。SW 不缓存个人数据库响应。

同一 Wi-Fi 测试可用手机访问电脑局域网 IP 的 5173 端口，Windows 防火墙需允许 Node 的私人网络访问。手机的 localhost 指手机自身。正式使用 HTTPS 部署，不依赖电脑开机。

### 真实两端同步验收

确认地址不带 `?demo=1`：

1. 电脑保存身体信息、今天体重，记录卧推 60 kg × 12、65 kg × 10、70 kg × 8，时长 45 分钟。
2. 手机同账号登录、刷新，确认三组与容量 **1930 kg**。
3. 手机新增食品每 100 g：165 kcal / 蛋白质 31 g / 碳水 0 g / 脂肪 3.6 g，记录 200 g。
4. 电脑刷新，确认 330 kcal / 蛋白质 62 g / 脂肪 7.2 g。修改食品库后历史仍不变。
5. 两端同时编辑同日训练：电脑先保存，手机旧版本保存应提示冲突并保留输入；重新读取后再修改。
6. 用测试记录验证修改删除；退出后不显示原数据；重新登录、刷新浏览器后记录仍存在。

保存后、窗口重新获得焦点/显示、恢复网络时自动读取；前台每 60 秒同步，也可手动刷新。无需 WebSocket/复杂离线队列。食品和资料采用最后成功写入值，训练有版本保护。`get_records` 使用一个 SQL 语句的一致性快照，避免读到不同版本的父子记录；标量 JSON 响应不会被默认 1000 行 API 上限截断。JSON 只用于响应，存储仍是关系表。第一版将个人历史载入内存，大量数据时再扩展按时间分页。

## 营养计算

集中在 `src/domain/calculations.ts`，有注释和可调参数，UI 只展示结果。

- BMR：`10×kg + 6.25×cm − 5×年龄 + 常数`（男 +5，女 −161）。[Mifflin–St Jeor 原始研究](https://pubmed.ncbi.nlm.nih.gov/2305711/)。
- 日常能量：BMR × 1.2 / 1.4 / 1.6；实用近似参数，不含专门训练。
- 训练净消耗：`(3.5−1)×3.5×kg/200×实际分钟`。3.5 MET 参考 [2024 Compendium resistance training 02054](https://pacompendium.com/conditioning-exercise/)。扣除静息 1 MET 避免重复。0 分钟不追加；训练容量不能直接换算热量。
- 蛋白质：默认 1.6 g/kg，可调 1.4–2.0。[ISSN 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/)。
- 脂肪：默认热量 30%，可调 20–35%，是实用分配参数，不是个体营养处方。碳水承接剩余；4 / 4 / 9 kcal/g，展示时才舍入。
- 体重使用所选日或之前最近记录，不能用未来体重。缺少身体信息/该日体重则不生成建议。历史目标按当前年龄、身高、营养参数重新估算，**不是冻结的当日处方**；历史实际摄入有快照。

第一版以成人维持体重为目标，不自动给出减脂/增重盈亏。以上数据仅作为日常健身与饮食记录参考，并非专业医疗或营养建议。

## 长期数据与维护

- 定期在设置中导出 JSON，包含训练、饮食、食品、身体数据。暂不提供界面导入，导出用于独立留存与未来迁移。
- 完整数据库恢复参考 [Supabase 备份文档](https://supabase.com/docs/guides/platform/backups)。Free 项目自行用官方 CLI 的 `supabase db dump` 定期导出 schema/data；凭据仅自己本机使用，不提交 Git。恢复前在空测试项目验证，不覆盖唯一副本。
- 更新流程：拉代码 → `npm ci` → `npm test` → `npm run build` → 部署。数据库变化先备份，加编号迁移并测试。
- 营养规则改独立计算模块与测试；数据库关系变化同时检查事务、复合外键、RLS。
- 图表延迟加载，无微服务、消息队列、实时订阅、多用户后台。

## 尚未实现

JSON/CSV 导入与一键恢复、冻结每日营养目标、减脂/增重目标、离线编辑队列、自动备份、食品外部数据库、照片识别、手表接入、体脂/围度。后续优先按真实反馈改进输入效率、备份恢复和历史筛选。

# 题评 · Problem Notes

一个面向 OI / ICPC 的题目质量评价站。为 `https://yjdqwq.github.io/` 准备。

先看界面：解压后打开 `dist/preview.html`。它内嵌样式、脚本和当前数据，可直接体验页面；GitHub 在线提交仍需要正式仓库。此预览初始为 8 道题、0 条评分，草稿不计入社区结果。

包括题库检索、平台筛选、竞赛／学习用途切换、独立完成者筛选、隐藏评分模式、题目详情、均值／中位数／分布、21 档评分、理由与剧透、草稿、收录请求、公开 GitHub 评分提交与自动汇总。

## 评分规则

质量 −10～10，0 为一般题。无评分显示待评。难度不参与质量计算。完整设计见 [SCORING.md](SCORING.md)，调研来源见 [RESEARCH.md](RESEARCH.md)。初始题库没有任何人类投票，也未导入其他站的净赞踩或难度标签。

## 本地运行

需要 Node.js 22 或更高，无第三方依赖。

```sh
npm test
npm run build
```

用任意静态服务器托管 `dist/`。直接双击 HTML 的 file 协议不支持读取评分 JSON。无 `GH_TOKEN` 的本地构建只生成初始题库，评分为空。

## 发布到 yjdqwq.github.io

1. 在 yjdqwq 账号下创建公开仓库 `yjdqwq.github.io`，默认分支使用 `main`，启用 Issues。
2. 把本项目所有文件提交至仓库根目录，保留 `.github/` 中的文件。
3. 仓库 Settings → Pages → Build and deployment，将 Source 设为 **GitHub Actions**。
4. Actions 中运行 **Publish ratings**；首次发布后访问 `https://yjdqwq.github.io/`。

不需要个人访问令牌、数据库密钥或额外收费服务。工作流使用仓库自动提供的 `GITHUB_TOKEN`，只读 Issues、构建页面并以官方 Pages Actions 发布。若组织策略阻止 Pages 或 Actions，需由仓库管理员调整对应设置。

## 真实提交与撤回

网页里的“保存草稿”只写当前浏览器。“提交到 GitHub”打开预填好的 Issue，用户在那里登录并确认提交；网页不会冒称提交成功。新建、编辑、关闭、重开、删除评分 Issue 或改变排除标签都会重新构建。

评分人身份使用 GitHub 元数据，JSON 内自填的名字不起作用。一账号／题目版本／用途仅最后更新的一条计票。关闭最新记录即撤回，较旧记录不会因此复活；重新编辑或重开记录表示更新自己的选择。管理员添加 `rating:excluded` 可排除记录。自动校验只接受允许平台的 HTTPS 正式题目链接与合法评分字段，PR、机器人记录和非法 JSON 不参与统计。

网页只显示构建时的公开快照，刷新时间取决于 GitHub Actions。编辑自己的 Issue 可以改分；流程不是网页内即时登录投票。初次上线之前，GitHub 提交链接尚不可用。

## 维护与测试

初始入口在 `public/data/catalogue.json`；链接和题名用于索引，不存档完整题面。题目修订后使用新的版本标识，避免混合评价。研究、规则、榜单门槛和可选标签可分别修改文档和 `public/lib.mjs`。

`tests/ratings.test.mjs` 检查零分与未评区分、身份来源、去重、版本／用途隔离、撤回与管理、非法链接、分布及提交链接。它不代替 GitHub 上的端到端发布验证。

# 题评 · Problem Notes

一个面向 OI / ICPC 的题目质量评价站。为 `https://yjdqwq.github.io/` 准备。

正式站点：<https://yjdqwq.github.io/>。题库批量索引洛谷主题库、Codeforces 和 AtCoder，另支持手动收录 QOJ 等题目。构建后打开 `dist/preview.html` 可离线体验；它内嵌样式、脚本和当前数据，公开提交仍在 GitHub 确认。

包括题库检索、平台筛选、分页和跳页、竞赛／学习用途切换、独立完成者筛选、隐藏评分模式、题目详情、均值／中位数／分布、21 档评分、理由与剧透、草稿、收录请求、公开 GitHub 评分提交与自动汇总。

## 评分规则

质量 −10～10，0 为一般题。无评分显示待评。难度不参与质量计算。完整设计见 [SCORING.md](SCORING.md)，调研来源见 [RESEARCH.md](RESEARCH.md)。初始题库没有任何人类投票，也未导入其他站的净赞踩或难度标签。

## 批量逐题评价

在题库右上角选择“批量评题”，粘贴洛谷 P／B／T／U／CF 题号，或者直接粘贴 Markdown 题目链接。支持空格、换行、逗号等分隔，每次最多 500 道不同题目。确认后只显示清单中的题，保持首次输入顺序；未收录题号会单独列出，可点“收录”补充后刷新。

点击“从第一题开始”，在详情里用“上一题”和“保存草稿并下一题”连续评价。切换或关闭详情时保存本地草稿，再次进入会恢复，包括选择的 0 分。草稿标记只代表本浏览器保存的内容；公开评分仍要在 GitHub 确认提交。

清单保存在当前浏览器，页面 URL 的 `list` 参数也记录有序题号，可收藏或分享。刷新后继续显示这份清单；“退出清单”恢复普通题库。清单不改变收藏，也不创建公开评分。洛谷的 `CF985F` 等 RemoteJudge 条目按洛谷链接收录，保留与原平台条目各自的索引。

## 本地运行

需要 Node.js 22 或更高，无第三方依赖。

```sh
npm test
npm run build
```

用任意静态服务器托管 `dist/`。直接双击 HTML 的 file 协议不支持读取评分 JSON。无 `GH_TOKEN` 的本地构建使用已保存题库，评分为空。

## 批量题库与更新

随仓库保存 `data/catalogue-snapshot.json.gz`，首次部署和接口故障时仍可构建完整索引。仅保存题号、标题、比赛名称、原题链接和来源提供的难度，不保存题面、测试数据或题解，也不导入别站的质量评分。

| 平台 | 批量来源 | 范围 |
| --- | --- | --- |
| 洛谷 | [官方公开导出](https://docs.lgapi.cn/open/judge/) | 导出文件内的 P 主题库，不声称包含所有私有、未导出或 RemoteJudge 题目 |
| Codeforces | [官方 problemset.problems API](https://codeforces.com/apiHelp/methods#problemset.problems) | API 返回的公开 problemset，未批量导入 Gym |
| AtCoder | [AtCoder Problems API](https://github.com/kenkoooo/AtCoderProblems/blob/main/doc/api.md) | 该社区索引返回的题目，非 AtCoder 官方 API |
| QOJ | 社区收录 | 尚未接入可靠的批量来源，不将手动入口冒充全量题库 |

`npm run sync:catalogue` 检查并写入 `.cache/catalogue.json.gz`；默认复用最近 24 小时的快照，`npm run sync:catalogue -- --force` 可手动刷新。Codeforces 请求间隔大于 2 秒，AtCoder Problems 请求间隔大于 1 秒。洛谷以流读取官方 gzip 文件，提取元数据后丢弃正文。

工作流每天定时检查，并在评分事件或发布时复用缓存；页面“题库来源与更新”显示各平台数量和实际成功导入时间。HTTP 错误、压缩流截断、格式错误、重复题号或异常缩减均保留旧数据，失败尝试不会改写成功时间。缓存失效时回退到仓库快照。更新仓库基线可在同步成功后复制缓存文件至 `data/catalogue-snapshot.json.gz`。

每页仅创建 25／50／100 行 DOM；搜索、平台、收藏、用途和排序先作用于完整索引，再分页。新增题目默认为待评，不自动获得 0 分或推荐。

## 发布到 yjdqwq.github.io

1. 在 yjdqwq 账号下创建公开仓库 `yjdqwq.github.io`，默认分支使用 `main`，启用 Issues。
2. 把本项目所有文件提交至仓库根目录，保留 `.github/` 中的文件。
3. 仓库 Settings → Pages → Build and deployment，将 Source 设为 **GitHub Actions**。
4. Actions 中运行 **Publish ratings**；首次发布后访问 `https://yjdqwq.github.io/`。

不需要个人访问令牌、数据库密钥或额外收费服务。工作流使用仓库自动提供的 `GITHUB_TOKEN`，只读 Issues、构建页面并以官方 Pages Actions 发布。若组织策略阻止 Pages 或 Actions，需由仓库管理员调整对应设置。

## 真实提交与撤回

网页里的“保存草稿”只写当前浏览器。“提交到 GitHub”打开预填好的 Issue，用户在那里登录并确认提交；网页不会冒称提交成功。新建、编辑、关闭、重开、删除评分 Issue 或改变排除标签都会重新构建。

评分人身份使用 GitHub 元数据，JSON 内自填的名字不起作用。一账号／题目版本／用途仅最后更新的一条计票。关闭最新记录即撤回，较旧记录不会因此复活；重新编辑或重开记录表示更新自己的选择。管理员添加 `rating:excluded` 可排除记录。自动校验只接受允许平台的 HTTPS 正式题目链接与合法评分字段，PR、机器人记录和非法 JSON 不参与统计。

网页只显示构建时的公开快照，刷新时间取决于 GitHub Actions。编辑自己的 Issue 可以改分；流程不是网页内即时登录投票。

## 维护与测试

手动入口在 `public/data/catalogue.json`，与批量索引按规范题号及版本去重；保留原入口的题名与来源说明。`public-v1` 只是索引版本，不代表对原题内容进行了归档。题目修订后使用新的版本标识，避免混合评价。研究、规则、榜单门槛和可选标签可分别修改文档和 `public/lib.mjs`。

测试检查评分校验、去重与撤回、版本／用途隔离、索引转换、截断数据流、更新回退、分页和筛选；发布时还需检查线上检索及真实元数据到评分表单的连接。


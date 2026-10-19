# 知识图片提取与项目接入

来源：https://math-network.yisigeekchalk.com/
提取日期：2026-10-19

已获取 1,162 张唯一图片：546 张教材原页、616 张教学插图与资料页，总计约 190 MiB。所有图片均通过文件解码检查；来源公开提供 SHA-256 的图片也核对了校验值。541 个公开正文数据文件用于建立图片关联。

## 已接入毕设项目

项目：E:\codex\毕设探索\tutor-question-bank
入口：侧栏「知识图片」，地址 /knowledge-images。
功能：知识点关键词搜索、教材/来源筛选、图片类型筛选、分页、大图阅读、来源追溯。
使用项目原有的 Start-Tutor.cmd 启动方式即可；本次没有另开开发服务器。

图片位于项目 public/math-network/，索引位于 public/math-network/catalog.json。
原始知识网络数据备份位于 data/math-network/knowledge-network.json；没有自动合并到项目已有知识图谱或覆盖现有节点 ID。

## 本交付目录

- catalog.json：图片地址、来源 URL、知识点名称/原站 ID、教材、页码、字节数、SHA-256。
- textbook-pages/：教材页原图。
- r80/assets/ 和 assets/：教学插图与资料页。
- knowledge-network.json：953 个原始节点及其关系，含原站未在当前界面展示的记录。
- verification.json：提取完整性结果。

网站知识关系图本身由 Canvas 动态绘制，不能作为一张原图直接下载；其节点与关系数据已经单独保存。图片目录仅建立原网站内部对应关系，没有假设它们与本项目节点 ID 一致。

未发现明确的再分发授权。本次仅完成本地下载与项目接入；公开部署或商用前请核实教材及资料的使用许可。

验证：图片解码通过；项目 TypeScript 检查通过。未启动浏览器，因此页面交互尚未做浏览器实测。

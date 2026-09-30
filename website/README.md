# LeetCode 笔记官网预览

独立的 Vite + React 官网页面，与桌面应用入口分开运行。首页、功能目录、八个功能详情、应用截图、版本下载和更新日志使用独立路由；应用截图直接引用项目根目录的 `docs/image`，品牌标识复用桌面应用的 `public/logo.png`。

```bash
npm run dev --prefix website
npm run build --prefix website
npm run preview --prefix website
```

版本信息和下载入口目前为静态演示内容；发布包地址确定后，可替换下载按钮的占位提示。

import { basename, extname, resolve } from "node:path";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
	base: "./",
	root: "src",
	plugins: [],
	publicDir: resolve(__dirname, "public"),
	build: {
		// distフォルダに出力
		outDir: resolve(__dirname, "dist"),
		// 存在しないときはフォルダを作成する
		emptyOutDir: true,
		copyPublicDir: true,
		rollupOptions: {
			// entry pointがあるindex.htmlのパス
			input: {
				"": resolve(__dirname, "src/index.html"),
			},
			// bundle.jsを差し替えする
			output: {
				entryFileNames: 'assets/bundle.js',
				assetFileNames: (assetInfo) => {
					const fileName = assetInfo.name ?? ""
					const ext = extname(fileName)
					const normalizedExt = ext || (fileName.startsWith(".") ? fileName : "")
					const inferredName = basename(fileName, ext)
					const normalizedName = inferredName.startsWith(".") ? "" : inferredName
					const baseName = normalizedName || (normalizedExt === ".css" ? "style" : "asset")
					return `assets/${baseName}-[hash]${normalizedExt}`
				},
			},
		},
	},
});

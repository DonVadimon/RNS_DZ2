import path from "path";
import HtmlWebpackPlugin from "html-webpack-plugin";
import { Configuration } from "webpack";
import CopyPlugin from "copy-webpack-plugin";

const resoleRoot = (...paths: string[]) => path.resolve(__dirname, ...paths);
const resoleSrc = (...paths: string[]) => resoleRoot("src", ...paths);
const resoleDist = (...paths: string[]) => resoleRoot("dist", ...paths);

export default {
    mode: "development",

    entry: {
        app: resoleSrc(),
    },

    output: {
        path: resoleDist(),
        filename: "[name].bundle.js",
        publicPath: "/",
    },

    resolve: {
        extensions: [".ts", ".tsx", ".js", ".jsx"],
        alias: { "@": resoleSrc() },
        fallback: {
            fs: false,
            path: false,
            crypto: false,
        },
    },

    devServer: {
        historyApiFallback: true,
    },

    plugins: [
        new HtmlWebpackPlugin({
            template: resoleRoot("public", "index.ejs"),
        }),
        new CopyPlugin({
            patterns: [
                { from: "node_modules/onnxruntime-web/dist/*.wasm", to: "[name][ext]" },
                { from: "public/models/*.onnx", to: "[name][ext]" },
            ],
        }),
    ],

    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: [
                    {
                        loader: "ts-loader",
                        options: {
                            compilerOptions: {
                                noEmit: false,
                            },
                        },
                    },
                ],
            },
            {
                test: /\.css$/,
                use: [
                    {
                        loader: "style-loader",
                    },
                    {
                        loader: "css-loader",
                    },
                ],
            },
            {
                test: /\.js.map$/,
                enforce: "pre",
                loader: "source-map-loader",
            },
            // images
            {
                test: /\.(png|jpg|jpeg|gif)$/i,
                type: "asset/resource",
            },
            // fonts
            {
                test: /\.(woff|ttf|eot)$/i,
                type: "asset/resource",
            },
        ],
    },
} as Configuration;

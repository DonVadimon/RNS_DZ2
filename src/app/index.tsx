import React, { useCallback, useEffect, useMemo } from "react";
import { useState } from "react";
import { Input, Button, CircularProgress, Container, ButtonGroup } from "@mui/material";
import cv from "@techstark/opencv-js";
import { Tensor, InferenceSession } from "onnxruntime-web";

import "./index.css";

const MODEL_NAME = "./best_300.onnx";
const MODE_INPUT_SHAPE = [1, 3, 640, 640];

const CLASSES_ATTRS: Record<
    number,
    {
        name: string;
        color: string;
    }
> = {
    0: {
        name: "zebra",
        color: "#ff355e",
    },
    1: {
        name: "zebroid",
        color: "#66ff66",
    },
    2: {
        name: "horse",
        color: "#33ddff",
    },
};

const preprocessing = async (source: HTMLImageElement, modelWidth: number, modelHeight: number) => {
    const mat = cv.imread(source); // read from img tag
    const matC3 = new cv.Mat(mat.rows, mat.cols, cv.CV_8UC3); // new image matrix
    cv.cvtColor(mat, matC3, cv.COLOR_RGBA2BGR); // RGBA to BGR

    // padding image to [n x n] dim
    const maxSize = Math.max(matC3.rows, matC3.cols); // get max size from width and height
    const xPad = maxSize - matC3.cols, // set xPadding
        xRatio = maxSize / matC3.cols; // set xRatio
    const yPad = maxSize - matC3.rows, // set yPadding
        yRatio = maxSize / matC3.rows; // set yRatio
    const matPad = new cv.Mat(); // new mat for padded image
    cv.copyMakeBorder(matC3, matPad, 0, yPad, 0, xPad, cv.BORDER_CONSTANT); // padding black

    const input = cv.blobFromImage(
        matPad,
        1 / 255.0, // normalize
        new cv.Size(modelWidth, modelHeight), // resize to model input size
        new cv.Scalar(0, 0, 0),
        true, // swapRB
        false // crop
    ); // preprocessing image matrix

    // release mat opencv
    mat.delete();
    matC3.delete();
    matPad.delete();

    return [input, xRatio, yRatio];
};

export const App = () => {
    const [file, setFile] = useState<File>();
    const [session, setSession] = useState<InferenceSession>();
    const [viewState, setViewState] = useState<
        "initial" | "preview" | "processing" | "result" | "error"
    >("initial");

    useEffect(() => {
        cv["onRuntimeInitialized"] = async () => {
            // create session
            console.log("Loading YOLOv7 model...");
            const yolov7 = await InferenceSession.create(MODEL_NAME);

            // warmup main model
            console.log("Warming up model...");
            const tensor = new Tensor(
                "float32",
                new Float32Array(MODE_INPUT_SHAPE.reduce((a, b) => a * b)),
                MODE_INPUT_SHAPE
            );
            await yolov7.run({ images: tensor });

            setSession(yolov7);
            console.log("Сессия создана и подготовлена");
        };
    }, []);

    const onFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && file.type === "image/jpeg") {
            setViewState("preview");
            setFile(file);
        }
    }, []);

    const submitAnalize = async () => {
        const canvas = document.getElementById("__CANVA__") as HTMLCanvasElement;
        const ctx = canvas?.getContext("2d", { willReadFrequently: true });

        if (!file || !session || !canvas || !ctx) {
            return;
        }

        setViewState("processing");

        // !!! STEP 2
        const image = new Image();

        image.src = URL.createObjectURL(file);
        image.onload = async () => {
            canvas.width = image.width;
            canvas.height = image.height;

            const xRatio1 = canvas.width / 640; // set xRatio1
            const yRatio1 = canvas.height / 640; // set yRatio1

            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

            const [modelWidth, modelHeight] = MODE_INPUT_SHAPE.slice(2);
            const [input, xRatio, yRatio] = await preprocessing(image, modelWidth, modelHeight);
            const tensor = new Tensor("float32", new cv.Mat(input).data32F, MODE_INPUT_SHAPE); // to ort.Tensor

            const { output } = await session.run({ images: tensor }); // run session and get output layer

            console.log("output: ", output);

            // !!! STEP 3
            const boxes = [];

            // looping through output
            for (let r = 0; r < output.size; r += output.dims[1]) {
                const data = output.data.slice(r, r + output.dims[1]); // get rows
                const x0 = data.slice(1)[0];
                const y0 = data.slice(1)[1];
                const x1 = data.slice(1)[2];
                const y1 = data.slice(1)[3];
                const classId = data.slice(1)[4];
                const score = data.slice(1)[5];

                const w = Number(x1) - Number(x0);
                const h = Number(y1) - Number(y0);

                boxes.push({
                    classId,
                    probability: score,
                    bounding: [
                        Number(x0) * Number(xRatio) * Number(xRatio1),
                        Number(y0) * Number(yRatio) * Number(yRatio1),
                        w * Number(xRatio) * Number(xRatio1),
                        h * Number(yRatio) * Number(yRatio1),
                    ],
                });
            }

            boxes.forEach((box) => {
                const [x1, y1, width, height] = box.bounding;
                const { classId, probability } = box;
                const attrs = CLASSES_ATTRS[Number(classId)];

                ctx.strokeStyle = attrs.color;
                ctx.lineWidth = 5; // толщина линии в 5px
                ctx.strokeRect(x1, y1, width, height);
                const msg = `${attrs.name} - ${(Number(probability) * 100).toFixed(0)}%`;
                ctx.fillText(msg, x1, y1);
            });

            setViewState("result");
        };
    };

    const previewSrc = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
    const showPreview = viewState === "preview" || (viewState === "processing" && previewSrc);

    const allowUpload = !!session;
    const allowSubmit = allowUpload && !!file && viewState !== "processing";
    const submitLoading = !session;

    return (
        <Container>
            <Container className="form">
                <ButtonGroup className="controls" variant="contained">
                    <Button disabled={!allowUpload} component="label" variant="contained">
                        Upload file
                        <Input className="file-input" type="file" onChange={onFileChange} />
                    </Button>
                    <Button disabled={!allowSubmit} variant={"contained"} onClick={submitAnalize}>
                        {submitLoading ? <CircularProgress size={32} color="inherit" /> : "Анализ"}
                    </Button>
                </ButtonGroup>
            </Container>

            <div className={`image-view ${viewState}`}>
                {showPreview && <img src={previewSrc} className="preview" />}
                <canvas id="__CANVA__"></canvas>
                {viewState === "processing" && (
                    <div className="processing-blur">
                        <CircularProgress className="preview-progress" />
                    </div>
                )}
            </div>
        </Container>
    );
};

"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const chip8 = new Chip8();
document.addEventListener('DOMContentLoaded', () => {
    var _a, _b;
    document.addEventListener("keypress", (ev) => {
        if (ev.key === 's') {
            chip8.forceSingleStep();
        }
    });
    let fileInput = undefined;
    (_a = document.getElementById("fileInput")) === null || _a === void 0 ? void 0 : _a.addEventListener("change", (event) => {
        fileInput = event.target.files[0];
    });
    (_b = document.getElementById("loadRomButton")) === null || _b === void 0 ? void 0 : _b.addEventListener("click", () => {
        if (!fileInput) {
            alert("No file selected.");
            return;
        }
        loadROM(fileInput);
    });
    const canvas = document.getElementById("screen");
    const debugConsole = document.getElementById("console");
    const ctx = canvas.getContext("2d");
    chip8.reset();
    setInterval(() => {
        chip8.step();
        renderScaledImageData(ctx, chip8.getScreenImageData(), 10, 10);
        debugConsole.textContent = JSON.stringify(chip8.debug(), null, 2);
    }, 1);
    function loadROM(romFile) {
        return __awaiter(this, void 0, void 0, function* () {
            yield chip8.loadRom(romFile);
        });
    }
});
function renderScaledImageData(ctx, imageData, sX, sY) {
    return __awaiter(this, void 0, void 0, function* () {
        const ibm = yield window.createImageBitmap(imageData, 0, 0, imageData.width, imageData.height, {
            resizeWidth: imageData.width * sX,
            resizeHeight: imageData.height * sY,
            resizeQuality: "pixelated",
        });
        ctx.drawImage(ibm, 0, 0);
    });
}

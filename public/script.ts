
const chip8 = new Chip8();

document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener("keypress",(ev)=>{
        if(ev.key === 's') {
            chip8.forceSingleStep();
        }
    });

    let fileInput: File | undefined = undefined;
    document.getElementById("fileInput")?.addEventListener("change", (event: any) => {
        fileInput = event.target.files[0];
    });
    document.getElementById("loadRomButton")?.addEventListener("click", () => {
        if (!fileInput) {
            alert("No file selected.");
            return;
        }
        loadROM(fileInput);
    });

    const canvas = document.getElementById("screen") as HTMLCanvasElement;
    const debugConsole = document.getElementById("console") as HTMLPreElement;
    const ctx = canvas.getContext("2d")!;

    chip8.reset();

    setInterval(()=>{
        chip8.step();
        renderScaledImageData(ctx, chip8.getScreenImageData(), 10, 10);
        debugConsole.textContent = JSON.stringify(chip8.debug(), null, 2);
    }, 1);

    async function loadROM(romFile: File) {
        await chip8.loadRom(romFile);
    }
});

async function renderScaledImageData(ctx: CanvasRenderingContext2D, imageData: ImageData, sX: number, sY: number) {
    const ibm = await window.createImageBitmap(imageData, 0, 0, imageData.width, imageData.height, {
        resizeWidth: imageData.width * sX, 
        resizeHeight: imageData.height * sY,
        resizeQuality: "pixelated",
      });
      ctx.drawImage(ibm, 0, 0);
}

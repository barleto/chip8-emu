/**
 * Screen size is 64Wx32H.
 * Specification: https://www.cs.columbia.edu/~sedwards/classes/2016/4840-spring/designs/Chip8.pdf
 */

/** MEm layout                                                                                                 
0x0________0x80_______0x200______________ 0xFFF                                   
|           |           |                |                       
| FONT SET  |    ???    |   CHIP-8       |                    
| Reserved  |           | Program/Data   |                 
|___________|___________|________________|                    
 */

function asBin(n:number) {
    return `0b${n.toString(2).padStart(8,"0")}`;
}

function asHex(n:number) {
    return `0x${n.toString(16).padStart(2,"0")}`;
}

function clamp(min: number, max: number, val: number) {
    return Math.max(min, Math.min(max, val));
}

function clampByte(val: number, nBytes: number = 1) {
    return Math.max(0x0, Math.min(0xFF * nBytes, val));
}

class Chip8 {
    private _cpu: CPU;
    private _halt: boolean = true;

    constructor() {
        this._cpu = new CPU();
    }

    public step() {
        if (this._halt) {
            return;
        }
        this._cpu.step();
    }

    public forceSingleStep() {
        this._cpu.step();
    }

    public updateKeyState(key: number, isPressed: boolean) {
        this._cpu.updateKeyState(key, isPressed ? 1 : 0);
    }

    public getScreenImageData() {
        return this._cpu.frameBuff.imageData;
    }

    start() {
        this._halt = false;
    }

    stop() {
        this._halt = true;
    }

    reset() {
        this._cpu.reset();
    }

    async loadRom(romFile: File) {
        const reader = new FileReader();
        reader.readAsArrayBuffer(romFile);

        reader.onerror = () => {
            console.log(reader.error);
        };

        reader.onload = () => {
            this.reset();
            console.log(`Load file '${romFile?.name}' success.`);
            let romByteArray = Array.from(new Uint8Array(reader.result as ArrayBuffer));
            this._cpu.mem.setMemStartingAt(MEM_PROG_ENTRY_POINT, romByteArray);
        };
    }

    debug() {
        return {
            "MEM[PC]": `0x${this._cpu.mem.getByteAt(this._cpu.registers.PC).toString(16).toUpperCase()} 0x${this._cpu.mem.getByteAt(this._cpu.registers.PC + 1).toString(16).toUpperCase()}`,
            PC: `0x${this._cpu.registers.PC.toString(16).toUpperCase()}`,
            SP: `0x${this._cpu.registers.SP.toString(16).toUpperCase()}`,
            I: `0x${this._cpu.registers.I.toString(16).toUpperCase()}`,
            V: this._cpu.registers.V.map((x, i) => `V${i.toString(16).toUpperCase()} : 0x${x.toString(16).toUpperCase()}`)

        };
    }
}

const MEM_PROG_ENTRY_POINT = 0x200;
const TIMER_CLOCK_FREQ = 60;
const CHAR_SPRITE_WIDTH = 5;
const FONT_SET_ARRAY = [
    0xF0, 0x90, 0x90, 0x90, 0xF0, //0
    0x20, 0x60, 0x20, 0x20, 0x70, //1
    0xF0, 0x10, 0xF0, 0x80, 0xF0, //2
    0xF0, 0x10, 0xF0, 0x10, 0xF0, //3
    0x90, 0x90, 0xF0, 0x10, 0x10, //4
    0xF0, 0x80, 0xF0, 0x10, 0xF0, //5
    0xF0, 0x80, 0xF0, 0x90, 0xF0, //6
    0xF0, 0x10, 0x20, 0x40, 0x40, //7
    0xF0, 0x90, 0xF0, 0x90, 0xF0, //8
    0xF0, 0x90, 0xF0, 0x10, 0xF0, //9
    0xF0, 0x90, 0xF0, 0x90, 0x90, //A
    0xE0, 0x90, 0xE0, 0x90, 0xE0, //B
    0xF0, 0x80, 0x80, 0x80, 0xF0, //C
    0xE0, 0x90, 0x90, 0x90, 0xE0, //D
    0xF0, 0x80, 0xF0, 0x80, 0xF0, //E
    0xF0, 0x80, 0xF0, 0x80, 0x80, //F
];

class CPU {
    static START_MEM_LOC = 0x200;


    registers = {
        V: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,], //8 bits
        SP: 0,
        I: 0, PC: CPU.START_MEM_LOC, // 16bit
        clockT: 0
    };
    keys: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,];
    mem!: Memory;
    frameBuff!: FrameBuffer;
    stack!: Stack;

    delayTimer: Timer = new Timer();//8bit
    soundTimer: Timer = new Timer();//8bit
    lastTimerTick = Date.now();

    _waitingIO = false;
    _ioValue?: number;

    constructor() {
        this.reset();
    }

    reset() {
        this.registers = {
            V: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,], //8 bits
            SP: 0,
            I: 0, PC: CPU.START_MEM_LOC,
            clockT: 0,
        };
        this.keys = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,];
        this.mem = new Memory();
        this.frameBuff = new FrameBuffer();
        this.stack = new Stack();
        this.frameBuff.clearScreen();
        this.mem.reset();
        this.stack.reset();
    }

    updateKeyState(key: number, newState: number) {
        newState = clamp(0, 1, newState);
        const prevState = this.keys[key];
        this.keys[key] = newState;
        if (this._waitingIO && !prevState && newState) {
            this._ioValue = key;
            this.step();
        }
    }

    timersStep() {
        const now = Date.now();
        const period = 1 / TIMER_CLOCK_FREQ;
        //Timers clock follow a different clock (Usually 60HZ)
        if (now - this.lastTimerTick < period) {
            return;
        }
        this.delayTimer.tick();
        this.soundTimer.tick();
        this.lastTimerTick = now;
    }

    step() {
        this.timersStep();
        const op_H = this.mem.getByteAt(this.registers.PC);
        const op_L = this.mem.getByteAt(this.registers.PC + 1);
        const fullOp = (op_H << 8) | op_L;
        const op_HPair = { h: (op_H & 0xF0) >> 4, l: op_H & 0x0F };
        const op_LPair = { h: (op_L & 0xF0) >> 4, l: op_L & 0x0F };
        const Vx = op_HPair.l;
        const Vy = op_LPair.h;
        
        switch (op_HPair.h) {
            case 0x0:
                switch (op_L) {
                    case 0xE0: //CLS
                        this.frameBuff.clearScreen();
                        break;
                    case 0xEE://RET
                        this.registers.PC = this.stack.get(this.registers.SP - 1) - 2;
                        this.registers.SP = Math.max(0, this.registers.SP - 1);
                        break;
                }
                break;
            case 0x1://JP
                this.registers.PC = (fullOp & 0x0FFF) - 2;
                break;
            case 0x2: //CALL
                this.stack.set(this.registers.SP, this.registers.PC + 2);
                this.registers.SP++;
                this.registers.PC = (fullOp & 0x0FFF) - 2;
                break;
            case 0x3://SE Vx, byte
                if (this.registers.V[Vx] === op_L) {
                    this.registers.PC += 2;
                }
                break;
            case 0x4://SNE Vx,b
                if (this.registers.V[Vx] !== op_L) {
                    this.registers.PC += 2;
                }
                break;
            case 0x5:// SE Vx, Vy
                if (this.registers.V[Vx] === this.registers.V[op_LPair.h]) {
                    this.registers.PC += 2;
                }
                break;
            case 0x6:// LD Vx,b
                this.registers.V[Vx] = op_L;
                break;
            case 0x7:// ADD Vx,b
                let sum = this.registers.V[Vx] + op_L;
                this.registers.V[0xF] = sum > 0xFF? 1 : 0;
                this.registers.V[Vx] = (sum) % 0x100;
                break;
            case 0x8:
                switch (op_LPair.l) {
                    case 0x0:
                        //LD Vx,Vy
                        this.registers.V[Vx] = this.registers.V[Vy];
                        break;
                    case 0x1:
                        //OR Vx,Vy
                        this.registers.V[Vx] = this.registers.V[Vx] | this.registers.V[Vy];
                        break;
                    case 0x2:
                        //AND Vx,Vy
                        this.registers.V[Vx] = this.registers.V[Vx] & this.registers.V[Vy];
                        break;
                    case 0x3:
                        // XOR Vx, vy
                        this.registers.V[Vx] = (this.registers.V[Vx] ^ this.registers.V[Vy]) & 0xFF;
                        break;
                    case 0x4:
                        //ADD Vx,
                        let add = this.registers.V[Vx] + this.registers.V[Vy];
                        if (add > 0xFF) {
                            add = add % 0x100;
                            this.registers.V[Vx] = add;
                            this.registers.V[0xF] = 1;
                        } else {
                            this.registers.V[Vx] = add;
                            this.registers.V[0xF] = 0;
                        }
                        break;
                    case 0x5:
                        //SUB Vx,Vy
                        let sub = this.registers.V[Vx] - this.registers.V[Vy];
                        if (sub < 0) {
                            sub = 256 + sub;
                            this.registers.V[Vx] = sub;
                            this.registers.V[0xF] = 0;
                        }
                        else {
                            this.registers.V[Vx] = sub;
                            this.registers.V[0xF] = 1;
                        }
                        break;
                    case 0x6:
                        //SHR Vx
                        var prevVal = this.registers.V[Vy]; 
                        let shr = prevVal >> 1;
                        this.registers.V[Vx] = shr;
                        this.registers.V[0xF] = prevVal & 0x01;
                        break;
                    case 0x7:
                        //SUB Vx,Vy
                        let subN = this.registers.V[Vy] - this.registers.V[Vx];
                        if (subN < 0) {
                            subN = 256 + subN;
                            this.registers.V[Vx] = subN;
                            this.registers.V[0xF] = 0;
                        }
                        else {
                            this.registers.V[Vx] = subN;
                            this.registers.V[0xF] = 1;
                        }
                        break;
                    case 0xE:
                        //SHL Vx, Vy
                        var prevVal = this.registers.V[Vy]; 
                        let shL = (prevVal << 1) & 0xFF;
                        this.registers.V[Vx] = shL;
                        this.registers.V[0xF] = (prevVal & 0b10000000) > 0 ? 1 : 0;
                        break;
                }
                break;
            case 0x9:
                //SNE Vx,Vy
                if (this.registers.V[Vx] !== this.registers.V[Vy]) {
                    this.registers.PC += 2;
                }
                break;
            case 0xA:
                //LD I, addr
                var addr = fullOp & 0x0FFF;
                this.registers.I = addr;
                break;
            case 0xB:
                //JP V0, addr
                var addr = fullOp & 0x0FFF;
                this.registers.PC = this.registers.V[0] + addr - 2;
                break;
            case 0xC:
                //RND Vx, byte
                this.registers.V[Vx] = Math.floor(Math.random() * 256) & op_L;
                break;
            case 0xD:
                //DRW Vx, Vy, length
                var length = op_LPair.l;
                var spriteByteData = [];
                for (var i = 0; i < length; i++) {
                    spriteByteData.push(this.mem.getByteAt(this.registers.I + i));
                }
                this.registers.V[0xF] = this.frameBuff.drawSprite(this.registers.V[Vx], this.registers.V[Vy], spriteByteData);
                break;
            case 0xE:
                switch (op_L) {
                    case 0x9E:
                        //SKP Vx
                        if (this.keys[this.registers.V[Vx]] === 1) {
                            this.registers.PC += 2;
                        }
                        break;
                    case 0xA1:
                        //SKNP Vx
                        if (this.keys[this.registers.V[Vx]] === 0) {
                            this.registers.PC += 2;
                        }
                        break;
                }
                break;
            case 0xF:
                switch (op_L) {
                    case 0x07:
                        //LD Vx, DT
                        this.registers.V[Vx] = this.delayTimer.getVaue();
                        break;
                    case 0x0A:
                        //LD Vx, K
                        //Halts programm until there's a keypress
                        if (!this._waitingIO) { //Start waiting for key press
                            this._waitingIO = true;
                            return; //Don't increase PC
                        }

                        if (this._ioValue === undefined) { //Still waiting for jey press
                            return; //Don't increase PC
                        } else {
                            //Key press found
                            this.registers.V[Vx] = this._ioValue; //Set Vx to the key pressed
                            this._ioValue = undefined; //reset value for next time
                            this._waitingIO = false; //unset waitingFlag
                        }

                        break;
                    case 0x15:
                        //LD DT, Vx
                        this.delayTimer.setValue(this.registers.V[Vx]);
                        break;
                    case 0x18:
                        //LD ST, Vx
                        this.soundTimer.setValue(this.registers.V[Vx])
                        break;
                    case 0x1E:
                        //ADD I, Vx
                        this.registers.I = (this.registers.I + this.registers.V[Vx]) & 0xFFFF;
                        break;
                    case 0x29:
                        //LD F, Vx
                        this.registers.I = this.registers.V[Vx] * CHAR_SPRITE_WIDTH;
                        break;
                    case 0x33:
                        //LD B, Vx (BCD)
                        var num = this.registers.V[Vx];
                        var hund = Math.floor(num / 100 % 10);
                        var dec = Math.floor(num / 10 % 10);
                        var unit = Math.floor(num % 10);
                        this.mem.setValue(this.registers.I, hund);
                        this.mem.setValue(this.registers.I + 1, dec);
                        this.mem.setValue(this.registers.I + 2, unit);
                        break;
                    case 0x55:
                        //LD [I], Vx
                        for (var i = 0; i <= Vx; i++) {
                            this.mem.setValue(this.registers.I + i, this.registers.V[i]);
                        }
                        this.registers.I = this.registers.I + Vx + 1;
                        break;
                    case 0x65:
                        //LD Vx, [I]
                        for (var i = 0; i <= Vx; i++) {
                            this.registers.V[i] = this.mem.getByteAt(this.registers.I + i);
                        }
                        this.registers.I = this.registers.I + Vx + 1;
                        break;

                }
                break;
        }

        this.registers.PC += 2;
    }
}

class Stack {
    stack: number[] = [];

    constructor(size: number = 64) {

    }

    reset() {
        this.stack = [];
    }

    get(addr: number): number {
        return this.stack[addr] ?? 0x0;
    }

    set(addr: number, val: number) {
        this.stack[addr] = clamp(0, 0xFFFF, val);
    }
}

class Memory {
    static MEM_SIZE = 4096;
    mem: number[] = [];

    constructor() {

    }

    reset() {
        //Load the font set ont he first 0x200 bytes of memory
        this.mem = [...FONT_SET_ARRAY];
        this.mem[0x0FFE] = 0x1F;
        this.mem[0x0FFF] = 0xFE;
    }

    getByteAt(address: number) {
        if (address < 0 || address > 0xFFF) {
            throw new Error(`Trying to acces mem addr out of bounds: '0x${address.toString(16)}'`);
        }
        return this.mem[address] ?? 0x0;
    }

    setValue(address: number, byte: number) {
        if (address < 0 || address > 0xFFF) {
            throw new Error(`Trying to acces mem addr out of bounds: '0x${address.toString(16)}'`);
        }
        this.mem[address] = clampByte(byte);
    }

    setMemStartingAt(offset: number, data: number[]) {
        console.log(`Loading ${data.length} bytes, starting at 0x${offset.toString(16).toUpperCase()}`);
        for (let i = 0; i < data.length; i++) {
            this.setValue(offset + i, data[i]);
        }
    }
}

/**
 * iterate each bit on the value calling `fn` for each, passing the value and bit position as a parameter, from high to low bits.
 * Ex: In a byte, `fn` id going to be called 8 times, with `idx` going from from 7 to 0, along the steps.
 */
function iterateBits(value: number, bitCount: number, fn: (b: number, idx: number) => any) {
    for (let i = bitCount - 1; i >= 0; i--) {
        const bitVal = (value >> i) & 0x01;
        fn(bitVal, i);
    }
}

class FrameBuffer {

    width: number;
    height: number;

    imageData: ImageData;
    pallete = [0xDD, 0x44];

    constructor(width: number = 64, height: number = 32) {
        this.width = width;
        this.height = height;
        this.imageData = new ImageData(width, height);
    }

    clearScreen() {
        for (let i = 0; i < this.imageData.data.length; i += 4) {
            this.colorPixelIdxAt(i, this.pallete[0]);
        }
    }

    colorpIxelCoordAt(x: number, y: number, color: number) {
        let i = y * this.width + x;
        i *= 4;
        this.imageData.data[i] = color;
        this.imageData.data[i + 1] = color;
        this.imageData.data[i + 2] = color;
        this.imageData.data[i + 3] = 255;
    }

    colorPixelIdxAt(idx: number, color: number) {
        this.imageData.data[idx] = color;
        this.imageData.data[idx + 1] = color;
        this.imageData.data[idx + 2] = color;
        this.imageData.data[idx + 3] = 255;
    }

    isSet(byte: number, i: number) {
        return (byte & (0x01 << i)) ? 1 : 0
    }

    /**
     * Return 1 if any set pixels are changed to unset, and 0 otherwise
     * @param Vx 
     * @param Vy 
     * @param spriteByteData 
     * @returns 
     */
    drawSprite(x: number, y: number, spriteByteData: number[]): number {
        let unset: boolean = false;
        let height = spriteByteData.length;
        for (let h = 0; h < height; h++) {
            const byteVal = spriteByteData[h];
            const initPixelId = ((y + h) * this.width + x) * 4;
            iterateBits(byteVal, 8, (b, bitIdx) => {
                const targetPixel = initPixelId + (7 - bitIdx) * 4;
                const prevValue = this.imageData.data[targetPixel] === this.pallete[1] ? 1 : 0;
                const newValue = b ? 1 : 0;
                unset ||= !!prevValue && !newValue;
                this.colorPixelIdxAt(targetPixel, this.pallete[prevValue ^ newValue]);
            });
        }
        return unset ? 1 : 0;
    }
}

class Timer {
    value = 0;

    constructor() {

    }

    setValue(newValue: number) {
        this.value = clampByte(newValue);
    }

    getVaue() {
        return this.value;
    }

    tick() {
        this.value = Math.max(0, this.value - 1);
    }

    isActive() {
        return this.value > 0;
    }
}
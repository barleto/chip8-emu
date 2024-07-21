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

function clamp(min: number, max: number, val: number) {
    return Math.max(min, Math.min(max, val));
}

function clampByte(val: number, nBytes: number = 1) {
    return Math.max(0x0, Math.min(0xFF * nBytes, val));
}

class Chip8 {

    private _cpu: CPU;

    constructor() {
        this._cpu = new CPU();
    }

    public step() {
        this._cpu.step();
    }

    public updateKeyState(key: number, isPressed: boolean) {
        this._cpu.updateKeyState(key, isPressed? 1 : 0);
        console.log(`${key.toString(16)}: ${isPressed}`);
    }

    public getScreenImageData() {
        return this._cpu.frameBuff.imageData;
    }

    start() {
        this._cpu.start();
    }

    stop() {
        this._cpu.stop();
    }

    reset() {
        this._cpu.reset();
        this.start();
    }
}

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
    _ioValue? : number;
    private _halt: any = true;

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
    }

    updateKeyState(key: number, newState: number) {
        newState = clamp(0, 1, newState);
        const prevState = this.keys[key];
        this.keys[key] = newState;
        if(this._waitingIO && !prevState && newState) {
            this._ioValue = key;
            this.step();
        }
    }

    timersStep() {
        const now = Date.now();
        const period = 1/TIMER_CLOCK_FREQ;
        //Timers clock follow a different clock (Usually 60HZ)
        if(now - this.lastTimerTick < period) {
            return;
        }
        this.delayTimer.tick();
        this.soundTimer.tick();
        this.lastTimerTick = now;
    }

    start() {
        this._halt = true;
    }

    stop() {
        this._halt = false;
    }

    step() {
        if(this._halt) {
            return;
        }
        this.timersStep();
        const op_H = this.mem.getByteAt(this.registers.PC);
        const op_L = this.mem.getByteAt(this.registers.PC + 1);
        const fullOp = (op_H << 8) | op_L;
        const op_HPair = { h: op_H & 0x0F, l: op_H & 0xF0 };
        const op_LPair = { h: op_L & 0x0F, l: op_L & 0xF0 };
        const Vx = op_HPair.l;
        const Vy = op_LPair.h;
        switch (op_HPair.h) {
            case 0x0:
                switch (op_L) {
                    case 0xE0: //CLS
                        this.frameBuff.clearScreen();
                        break;
                    case 0xEE://RET
                        this.registers.PC = this.stack.get(this.registers.SP);
                        this.registers.SP = Math.max(0, this.registers.SP - 1);
                        break;
                }
                break;
            case 0x1://JP
                this.registers.PC = fullOp & 0x0FFF;
                break;
            case 0x2: //CALL
                this.registers.SP++;
                this.stack.set(this.registers.SP, this.registers.PC);
                break;
            case 0x3://SE Vx, byteyyte
                this.registers.V[Vx] = Math.round(Math.random() * 256);
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
                this.registers.V[Vx] = this.registers.V[Vx] + op_L;
                break;
            case 0x8:
                switch (op_LPair.l) {
                    case 0x0:
                        //LD Vx,Vy
                        this.registers.V[Vx] = this.registers.V[op_LPair.h];
                        break;
                    case 0x1:
                        //OR Vx,Vy
                        this.registers.V[Vx] = this.registers.V[Vx] | this.registers.V[op_LPair.h];
                        break;
                    case 0x2:
                        //AND Vx,Vy
                        this.registers.V[Vx] = this.registers.V[Vx] & this.registers.V[op_LPair.h];
                        break;
                    case 0x3:
                        // XOR Vx, vy
                        this.registers.V[Vx] = (this.registers.V[Vx] ^ this.registers.V[op_LPair.h]) & 0xFFFF;
                        break;
                    case 0x4:
                        //ADD Vx,Vy
                        let add = this.registers.V[Vx] - this.registers.V[op_LPair.h];
                        if (add > 0xFFFF) {
                            add = add % 0xFFFF;
                            this.registers.V[0xF] = 1;
                        } else {
                            this.registers.V[0xF] = 0;
                        }
                        this.registers.V[Vx] = add;
                        break;
                    case 0x5:
                        //SUB Vx,Vy
                        let sub = this.registers.V[Vx] - this.registers.V[op_LPair.h];
                        if (sub < 0) {
                            this.registers.V[0xF] = 0;
                            sub = 256 - sub;
                        }
                        else {
                            this.registers.V[0xF] = 1;
                        }
                        this.registers.V[Vx] = sub;
                        break;
                    case 0x6:
                        //SHR Vx
                        let shr = this.registers.V[op_LPair.h] >> 1;
                        this.registers.V[0xF] = this.registers.V[op_LPair.h] & 0x0001;
                        this.registers.V[Vx] = shr;
                        break;
                    case 0x7:
                        //SUB Vx,Vy
                        let subN = this.registers.V[op_LPair.h] - this.registers.V[Vx];
                        if (subN < 0) {
                            this.registers.V[0xF] = 0;
                            subN = 256 - subN;
                        }
                        else {
                            this.registers.V[0xF] = 1;
                        }
                        this.registers.V[Vx] = subN;
                        break;
                    case 0xE:
                        //SHL Vx
                        let shL = this.registers.V[op_LPair.h] << 1;
                        this.registers.V[0xF] = this.registers.V[op_LPair.h] & 0x8000;
                        this.registers.V[Vx] = shL;
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
                this.registers.PC = this.registers.V[0] + addr;
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
                this.registers.V[0xF] = this.frameBuff.drawSprite(Vx, Vy, spriteByteData);
                break;
            case 0xE:
                switch (op_L) {
                    case 0x9E:
                        //SKP Vx
                        if (this.keys[Vx] === 1) {
                            this.registers.PC += 2;
                        }
                        break;
                    case 0xA1:
                        //SKNP Vx
                        if (this.keys[Vx] === 0) {
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
                        if(!this._waitingIO) { //Start waiting for key press
                            this._waitingIO = true;
                            return; //Don't increase PC
                        }

                        if(!this._ioValue) { //Still waiting for jey press
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
                        this.registers.I = this.registers.I + this.registers.V[Vx];
                        break;
                    case 0x29:
                        //LD F, Vx
                        this.registers.I = this.registers.V[Vx] * CHAR_SPRITE_WIDTH;
                        break;
                    case 0x33:
                        //LD B, Vx
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
        this.stack[addr] = clampByte(val);
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
}

/**
 * iterate each bit on the value calling `fn` for each, passing the value and bit position as a parameter, from high to low bits.
 * Ex: In a byte, `fn` id going to be called 8 times, with `idx` going from from 7 to 0, along the steps.
 */
function iterateBits(value: number, bitCount: number, fn:(b: number, idx: number) => any) {
    for(let i = bitCount; i > 0; i--) {
        const bitVal = (value >> i) & 0x01;
        fn(bitVal, i - 1);
    }
}

class FrameBuffer {

    width: number;
    height: number;

    screen: number[] = [];

    imageData: ImageData;
    pallete = [0x0D, 0x02];

    constructor(width: number = 64, height: number = 32) {
        this.width = width;
        this.height = height;
        this.imageData = new ImageData(width, height);
    }

    clearScreen() {
        this.screen = [];
        for (let i = 0; i < this.imageData.data.length; i += 4) {
            this.colorPixelIdxAt(i, this.pallete[0]);
        }
    }

    colorpIxelCoordAt(x: number, y:number, color: number){
        const i = y * this.width + x;
        this.imageData.data[i] = color;
            this.imageData.data[i + 1] = color;
            this.imageData.data[i + 2] = color;
            this.imageData.data[i + 3] = color;
    }

    colorPixelIdxAt(idx: number, color: number){
        this.imageData.data[idx] = color;
            this.imageData.data[idx + 1] = color;
            this.imageData.data[idx + 2] = color;
            this.imageData.data[idx + 3] = color;
    }

    updateImageData() {
        this.clearScreen();
        for(let i = 0; i < this.screen.length; i++) {
            const byteVal = this.screen[i] ?? 0;
            iterateBits(byteVal, 8,(bitVal, bitIdx) =>{
                const imgIdx = (i * 8) + ((8 - bitIdx + 1) * 4);
                this.colorPixelIdxAt(imgIdx, this.pallete[bitVal]);
            });
        }
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
        for (var h = y; h < y + height; h++) {
            const newVal = spriteByteData[h - y];
            const prevVal = this.screen[h * this.width + x] ?? 0;
            unset ||= (prevVal ^ newVal & 0) > 0;
            this.screen[h * this.width + x] = newVal;
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
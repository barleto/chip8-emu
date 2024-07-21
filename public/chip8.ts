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
}

class CPU {
    static START_MEM_LOC = 0x200;


    registers = {
        V: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,], //8 bits
        SP: 0,
        I: 0, PC: CPU.START_MEM_LOC, // 16bit
        clockT: 0
    };
    mem!: Memory;
    frameBuff!: FrameBuffer;
    stack!: Stack;

    delayTimer: Timer = new Timer();//8bit
    soundTimer: Timer = new Timer();//8bit

    constructor() {
        this.reset();
    }

    reset() {
        this.registers = {
            V0: 0, V1: 0, V2: 0, V3: 0, V4: 0, V5: 0, V6: 0, V7: 0, V8: 0, V9: 0, VA: 0, VB: 0, VC: 0, VD: 0, VE: 0, VF: 0, SP: 0,
            I: 0, PC: CPU.START_MEM_LOC,
            clockT: 0,
        };
        this.mem = new Memory();
        this.frameBuff = new FrameBuffer();
        this.stack = new Stack();
    }

    step() {
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
                //DRW Vx, Vy, nibble
                //TODO
                break;
            case 0xE:
                switch (op_L) {
                    case 0x9E:
                        //SKP Vx TODO
                        /**Skip next instruction if key with the value of Vx is pressed. Checks the keyboard, and if the key corresponding
to the value of Vx is currently in the down position, PC is increased by 2 */
                        break;
                    case 0xA1:
                        //SKNP Vx TODO
                        /**Skip next instruction if key with the value of Vx is not pressed. Checks the keyboard, and if the key
corresponding to the value of Vx is currently in the up position, PC is increased by 2. */
                        break;
                }
                break;
            case 0xF:
                switch (op_L) {
                    case 0x07:
                        break;
                    case 0x0A:
                        break;
                    case 0x15:
                        break;
                    case 0x18:
                        break;
                    case 0x1E:
                        break;
                    case 0x29:
                        break;
                    case 0x33:
                        break;
                    case 0x55:
                        break;
                    case 0x65:
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
        this.mem = [...FontSet];
    }

    getByteAt(address: number) {
        if (address < 0 || address > 0xFFF) {
            throw new Error(`Trying to acces mem addr out of bounds: '0x${address.toString(16)}'`);
        }
        return this.mem[address] ?? 0x0;
    }
}

class FrameBuffer {
    width: number;
    height: number;

    screen: number[] = [];

    constructor(width: number = 64, height: number = 32) {
        this.width = width;
        this.height = height;
    }

    clearScreen() {
        this.screen = [];
    }
}

class Timer {
    value = 0;

    constructor() {

    }

    setValue(newValue: number) {
        this.value = clampByte(newValue);
    }

    tick() {
        this.value = Math.max(0, this.value - 1);
    }

    isActive() {
        return this.value > 0;
    }
}

const FontSet = [
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
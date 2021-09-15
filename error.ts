import { Position } from './ast'

export class CompileError {
    msg: string
    isWarning: boolean
    beginPos: Position

    constructor(msg: string, beginPos: Position, isWarning = false) {
        this.msg = msg
        this.beginPos = beginPos
        this.isWarning = isWarning
    }
}

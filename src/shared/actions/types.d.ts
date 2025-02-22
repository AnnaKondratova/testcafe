import { ActionCommandBase } from '../../test-run/commands/base';
import EventEmitter from '../utils/event-emitter';

export interface AutomationHandler {
    create: (cmd: ActionCommandBase, elements: any[]) => Automation;
    ensureElsProps?: (elements: any[]) => void;
    ensureCmdArgs?: (cmd: ActionCommandBase) => void;
    additionalSelectorProps?: string[];
}

export interface Automation extends EventEmitter {
    run(strictElementCheck: boolean): Promise<any>;
    TARGET_ELEMENT_FOUND_EVENT?: string;
}

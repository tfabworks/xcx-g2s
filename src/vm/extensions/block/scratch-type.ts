import type { EventEmitter } from 'node:events';

type Underscore<P extends string> = `__${P}`;
type Underscored<T extends string> = { [P in T as Underscore<P>]: Underscore<P> };
type Brand<K, T extends string> = K & Underscored<T>;

// =========================================
// 基本的な列挙型の定義
// =========================================
export type ArgumentType = 'angle' | 'Boolean' | 'color' | 'number' | 'string' | 'matrix' | 'note' | 'image';
export type BlockType = 'Boolean' | 'button' | 'command' | 'conditional' | 'event' | 'hat' | 'loop' | 'reporter';
export type TargetType = 'sprite' | 'stage';
export type VariableType = '' | 'list' | 'broadcast_msg';
export type ThreadStatus = 'running' | 'promised' | 'done';
export type ReporterScope = 'global' | 'target';

// =========================================
// 基本的なデータ構造の定義
// =========================================
export type Variable = {
    id: string;
    name: string;
    type: VariableType;
    value: unknown;
    isCloud: boolean;
};

export type Comment = {
    id: string;
    blockId: string | null;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    minimized: boolean;
};

// =========================================
// モニターとプロファイラー関連の定義
// =========================================
export interface IMonitorRecord {
    id: string | null;
    spriteName: string | null;
    targetId: string | null;
    opcode: string | null;
    value: unknown;
    params: unknown;
    mode: string;
    sliderMin: number;
    sliderMax: number;
    isDiscrete: boolean;
    x: number | null;
    y: number | null;
    width: number;
    height: number;
    visible: boolean;
}

export interface IProfilerFrame {
    id: number;
    totalTime: number;
    selfTime: number;
    arg: unknown;
    depth: number;
    count: number;
}

// =========================================
// ブロック関連のインターフェース
// =========================================
export interface IBlocks {
    runtime: IRuntime;
    _blocks: Record<string, unknown>;
    _scripts: Array<string>;
    createBlock: (block: unknown) => void;
    deleteBlock: (blockId: string) => void;
    getBlock: (blockId: string) => unknown;
    getOpcode: (block: unknown) => string;
    getFields: (block: unknown) => Record<string, unknown>;
    getInputs: (block: unknown) => Record<string, unknown>;
    getProcedureDefinition: (procedureCode: string) => string | null;
    getProcedureParamNamesAndIds: (procedureCode: string) => Array<Array<string>>;
}

export interface IBlockUtility {
    sequencer: ISequencer;
    thread: IThread;
    runtime: IRuntime;
    target: ITarget;
    stackFrame: Record<string, unknown>;
    startBranch: (branchNum: number, isLoop: boolean) => void;
    startProcedure: (procedureCode: string) => void;
    stopThisScript: () => void;
    stopOtherTargetScripts: (target: ITarget) => void;
}

// =========================================
// 実行エンジン関連のインターフェース
// =========================================
export interface IRuntime extends EventEmitter {
    targets: Array<ITarget>;
    renderer: unknown;
    audioEngine: unknown;
    ioDevices: Record<string, unknown>;
    turboMode: boolean;
    profiler: IProfilerFrame | null;
    currentMSecs: number;
    currentStepTime: number;
    redrawRequested: boolean;
    emit: (eventName: string, data?: unknown) => boolean;
    startHats: (requestedHat: string, optMatchFields?: object, optTarget?: ITarget) => Array<IThread>;
    stopAll: () => void;
    stopForTarget: (target: ITarget) => void;
    getTargetById: (targetId: string) => ITarget | null;
    refreshTargets: () => void;
    requestRedraw: () => void;
}

export interface IThread {
    id: string;
    target: ITarget;
    blockContainer: IBlocks;
    status: ThreadStatus;
    peekStack: () => string | null;
    pushStack: (blockId: string) => void;
    reuseStackForNextBlock: (blockId: string) => void;
    popStack: () => string | null;
    stopThisScript: () => void;
    peekStackFrame: () => StackFrame;
    pushReportedValue: (value: unknown) => void;
}

export interface ISequencer {
    runtime: IRuntime;
    activeThread: IThread | null;
    stepThreads: () => Array<IThread>;
    stepThread: (thread: IThread) => void;
    retireThread: (thread: IThread) => void;
    stepToBranch: (thread: IThread, branchNum: number, isLoop: boolean) => void;
    stepToProcedure: (thread: IThread, procedureCode: string) => void;
}

// =========================================
// ターゲットとスプライト関連のインターフェース
// =========================================
export interface ITarget extends EventEmitter {
    id: string;
    name: string;
    isStage: boolean;
    x: number;
    y: number;
    direction: number;
    size: number;
    draggable: boolean;
    currentCostume: number;
    blocks: IBlocks;
    variables: Record<string, Variable>;
    comments: Record<string, Comment>;
    runtime: IRuntime;
    isOriginal: boolean;
    visible: boolean;
    drawableID: number | null;
    rotationStyle: string;
    lookupVariableById: (id: string) => Variable | null;
    createVariable: (id: string, name: string, type: VariableType) => void;
}

export interface ISprite {
    runtime: IRuntime;
    blocks: IBlocks;
    name: string;
    costumes: Array<unknown>;
    sounds: Array<unknown>;
    clones: Array<ITarget>;
    soundBank: unknown;
    createClone: () => ITarget;
    removeClone: (clone: ITarget) => void;
}

// =========================================
// 拡張機能関連のインターフェース
// =========================================
export interface IExtensionManager {
    // 基本プロパティ
    nextExtensionWorker: number;
    pendingExtensions: Array<PendingExtensionWorker>;
    pendingWorkers: Array<PendingExtensionWorker>;
    runtime: IRuntime;
    extensionLibraryContent: Array<ExtensionMetadata>;

    // メソッド
    isExtensionLoaded: (extensionId: string) => boolean;
    loadExtensionIdSync: (extensionId: string) => void;
    loadExtensionURL: (extensionURL: string) => Promise<void>;
    fetchExtension: (extensionURL: string) => Promise<{
        entry: Record<string, unknown>;
        blockClass: unknown;
    }>;
    refreshBlocks: () => Promise<void>;
}

export interface IVirtualMachine extends EventEmitter {
    runtime: IRuntime;
    extensionManager: IExtensionManager;
    editingTarget: ITarget | null;
    setEditingTarget: (targetId: string) => void;
    clear: () => void;
    start: () => void;
    stop: () => void;
    greenFlag: () => void;
    setTurboMode: (turboMode: boolean) => void;
    loadProject: (projectData: unknown) => Promise<void>;
}

// メッセージと項目の基本型
export type FormatMessage = {
    id: string;
    default: string;
    description?: string;
};

export type MenuItem = {
    text: string;
    value: string;
};

export type MenuItemInfo = string | MenuItem;




// ブロック引数関連の型定義
export type ScratchBlockArgument = {
    type: ArgumentType;
    defaultValue?: unknown;
    menu?: string;
    dataURI?: string;
    flipRTL?: boolean;
};

export type ScratchBlockArgumentMap = {
    [key: string]: ScratchBlockArgument;
};

export type ScratchBlock = {
    opcode: string;
    blockType: BlockType;
    text: string | FormatMessage;
    arguments?: ScratchBlockArgumentMap;
    filter?: string[];
    branchCount?: number;
    isTerminal?: boolean;
    func?: string;
    hideFromPalette?: boolean;
};

// メニュー関連の型定義
export type ExtensionMenuItemSimple = string;

export type ExtensionMenuItemComplex = {
    value: unknown;
    text: string;
};

export type ExtensionMenuItems = Array<ExtensionMenuItemSimple | ExtensionMenuItemComplex>;

export type ExtensionDynamicMenu = Exclude<string, keyof IExtensionBlocks>;

export type ExtensionMenuMetadata = {
    items: Array<MenuItems | string>;
    acceptReporters?: boolean;
};

// ブロック関連の型定義
export type ExtensionBlockMetadata = {
    opcode: string;
    blockType: BlockType;
    text: string | FormatMessage;
    arguments?: ScratchBlockArgumentMap;
    branchCount?: number;
    isTerminal?: boolean;
    func?: string;
    hideFromPalette?: boolean;
    disableMonitor?: boolean;
    reporterScope?: ReporterScope;
    isEdgeActivated?: boolean;
    shouldRestartExistingThreads?: boolean;

};

export type ExtensionBlocksBlockInfo = {
    name: string;
    blockIconURI?: string;
    menuIconURI?: string;
    blocks: ExtensionBlockMetadata[];
    menus?: Record<string, ExtensionMenuMetadata>;
    filter?: TargetType[];
}

// 拡張機能関連の型定義
export type ExtensionMetadata = {
    id: string;
    name: string | FormatMessage;
    blocks: ExtensionBlockMetadata[];
    menus?: Record<string, ExtensionMenuMetadata>;
    blockIconURI?: string;
    menuIconURI?: string;
    docsURI?: string;
    extensionURL?: string;
    targetTypes?: string[];
};

// マネージャー関連の型定義
export type ExtensionManager = {
    extensionLibraryContent: Array<ExtensionMetadata>;
    isExtensionLoaded: (extensionId: string) => boolean;
    loadExtensionIdSync: (extensionId: string) => void;
    loadExtensionURL: (extensionURL: string) => Promise<void>;
    refreshBlocks: () => Promise<void>;
};

// スレッド関連の型定義
export type StackFrame = {
    isLoop: boolean;
    warpMode: boolean;
    justReported: boolean;
    reporting: string | null;
    reported: Array<{opCached: string, inputValue: unknown}> | null;
    waitingReporter: boolean;
    params: {[key: string]: unknown};
    executionContext: unknown;
};

// ブロック実行関連の型定義
export type BlockUtilityProps = {
    sequencer: unknown;
    thread: unknown;
    runtime: unknown;
    target: unknown;
    blockContainer: unknown;
};

// ステージレイヤー関連の型定義
export type LayerType = 'background' | 'video' | 'pen' | 'sprite';

// スプライト関連の型定義
export type SpriteProps = {
    blocks: unknown;
    runtime: unknown;
    costumes: Array<unknown>;
    sounds: Array<unknown>;
    clones: Array<unknown>;
    soundBank: unknown;
    name: string;
};

// ターゲット関連の型定義
export type TargetProps = {
    runtime: unknown;
    blocks: unknown;
    variables: {[key: string]: Variable};
    comments: {[key: string]: unknown};
    currentCostume: number;
    visible: boolean;
    x: number;
    y: number;
    direction: number;
    draggable: boolean;
    rotationStyle: string;
};

// 実行キャッシュ関連の型定義
export type BlockExecuteCacheProps = {
    id: string;
    opcode: string;
    fields: {[key: string]: unknown};
    inputs: {[key: string]: unknown};
    block: unknown;
    ops: Array<unknown>;
    _isHat: boolean;
    _definedBlockFunction: (() => unknown) | null;
};

// モニター関連の型定義
export type MonitorProps = {
    id: string;
    mode: string;
    opcode: string;
    params: {[key: string]: unknown};
    spriteName: string | null;
    value: unknown;
    width: number;
    height: number;
    x: number;
    y: number;
    visible: boolean;
    sliderMin: number;
    sliderMax: number;
    isDiscrete: boolean;
};

// クラス関連の型定義
export interface IRuntime {
    targets: Array<ITarget>;
    renderer: unknown;
    audioEngine: unknown;
    ioDevices: {[key: string]: unknown};
    turboMode: boolean;
    profiler: IProfilerFrame | null;
    currentMSecs: number;
    currentStepTime: number;
    redrawRequested: boolean;
    emit: (eventName: string, data?: unknown) => boolean;
    startHats: (requestedHat: string, optMatchFields?: object, optTarget?: ITarget) => Array<IThread>;
    stopAll: () => void;
    stopForTarget: (target: ITarget) => void;
    getTargetById: (targetId: string) => ITarget | null;
    refreshTargets: () => void;
    requestRedraw: () => void;
}

export interface IThread {
    id: string;
    target: ITarget;
    blockContainer: IBlocks;
    status: ThreadStatus;
    peekStack: () => string | null;
    pushStack: (blockId: string) => void;
    reuseStackForNextBlock: (blockId: string) => void;
    popStack: () => string | null;
    stopThisScript: () => void;
    peekStackFrame: () => StackFrame;
    pushReportedValue: (value: unknown) => void;
}

export interface IBlocks {
    runtime: IRuntime;
    _blocks: {[key: string]: unknown};
    _scripts: Array<string>;
    createBlock: (block: unknown) => void;
    deleteBlock: (blockId: string) => void;
    getBlock: (blockId: string) => unknown;
    getOpcode: (block: unknown) => string;
    getFields: (block: unknown) => {[key: string]: unknown};
    getInputs: (block: unknown) => {[key: string]: unknown};
    getProcedureDefinition: (procedureCode: string) => string | null;
    getProcedureParamNamesAndIds: (procedureCode: string) => Array<Array<string>>;
}

export interface ITarget extends EventEmitter {
    id: string;
    name: string;
    isStage: boolean;
    x: number;
    y: number;
    direction: number;
    size: number;
    draggable: boolean;
    currentCostume: number;
    blocks: IBlocks;
    variables: {[key: string]: Variable};
    comments: {[key: string]: Comment};
    runtime: IRuntime;
    isOriginal: boolean;
    visible: boolean;
    drawableID: number | null;
    rotationStyle: string;
    lookupVariableById: (id: string) => Variable | null;
    createVariable: (id: string, name: string, type: VariableType) => void;
}

export interface ISprite {
    runtime: IRuntime;
    blocks: IBlocks;
    name: string;
    costumes: Array<unknown>;
    sounds: Array<unknown>;
    clones: Array<ITarget>;
    soundBank: unknown;
    createClone: () => ITarget;
    removeClone: (clone: ITarget) => void;
}

export interface ISequencer {
    runtime: IRuntime;
    activeThread: IThread | null;
    stepThreads: () => Array<IThread>;
    stepThread: (thread: IThread) => void;
    retireThread: (thread: IThread) => void;
    stepToBranch: (thread: IThread, branchNum: number, isLoop: boolean) => void;
    stepToProcedure: (thread: IThread, procedureCode: string) => void;
}

export interface IBlockUtility {
    sequencer: ISequencer;
    thread: IThread;
    runtime: IRuntime;
    target: ITarget;
    stackFrame: {[key: string]: unknown};
    startBranch: (branchNum: number, isLoop: boolean) => void;
    startProcedure: (procedureCode: string) => void;
    stopThisScript: () => void;
    stopOtherTargetScripts: (target: ITarget) => void;
}

export interface IVirtualMachine extends EventEmitter {
    runtime: IRuntime;
    extensionManager: IExtensionManager;
    editingTarget: ITarget | null;
    setEditingTarget: (targetId: string) => void;
    clear: () => void;
    start: () => void;
    stop: () => void;
    greenFlag: () => void;
    setTurboMode: (turboMode: boolean) => void;
    loadProject: (projectData: unknown) => Promise<void>;
}

// これらは単純なオブジェクト構造なのでtypeのままで良い
export type ArgumentInfo = {
    type: ArgumentType;
    default?: unknown;
};

export type ConvertedBlockInfo = {
    info: ExtensionBlockMetadata;
    json: Record<string, unknown>;
    xml: string;
};

export type CategoryInfo = {
    id: string;
    name: string;
    blockIconURI?: string;
    color1: string;
    color2: string;
    color3: string;
    blocks: Array<ConvertedBlockInfo>;
    menus: Array<Record<string, unknown>>;
};

export type PendingExtensionWorker = {
    extensionURL: string;
    resolve: () => void;
    reject: () => void;
};

// =========================================
// エンジン関連の型定義
// =========================================
export type Block = {
    id: string;
    opcode: string;
    inputs: Record<string, {
        block: string | null;
        shadow: string | null;
    }>;
    fields: Record<string, {
        value: unknown;
    }>;
    next: string | null;
    topLevel: boolean;
    parent: string | null;
    shadow: boolean;
    x: number | null;
    y: number | null;
};

export type MutationRecord = {
    tagName: string;
    children: MutationRecord[];
    blockInfo?: unknown;
    [key: string]: unknown;
};

// =========================================
// ブロック実行関連の型定義
// =========================================
export type BlockFunctionArgs = {
    [key: string]: string | number | boolean | undefined;
};

export type BlockFunction = (
    args: BlockFunctionArgs,
    util: IBlockUtility
) => string | number | boolean | Promise<string | number | boolean> | undefined;

export type MenuFunction = () => ExtensionMenuItems;

export type BlockPrimitives = Record<string, BlockFunction>;

export type BlockInfo = {
    id: string;
    name: string;
    blocks: Array<{
        opcode?: string;
        blockType: BlockType;
        text: string;
        func?: string;
        arguments?: Record<string, {
            type: ArgumentType;
            defaultValue?: unknown;
            menu?: string;
            dataURI?: string;
        }>;
    }>;
};

// =========================================
// ユーティリティ関連の型定義
// =========================================
export type RGBObject = {
    r: number;
    g: number;
    b: number;
};

export type HSVObject = {
    h: number;
    s: number;
    v: number;
};

export type TaskRecord = {
    cost: number;
    wrappedTask: () => void;
};

// =========================================
// 拡張機能クラスのインターフェース
// =========================================
export type ExtensionBlocksConstructor = {
    new (runtime: IRuntime): IExtensionBlocks;
};

export type IExtensionBlocks = {

    /**
     * 拡張機能の情報を返す
     * @returns 拡張機能の情報
     */
    getInfo(): ExtensionMetadata;

    /**
     * スキャンを開始する（オプショナル）
     * @returns スキャン結果のPromise
     */
    scan?(): Promise<unknown>;

    /**
     * 切断する（オプショナル）
     */
    disconnect?(): void;

    /**
     * ブロックの実行前に呼ばれる（オプショナル）
     */
    beforeExecute?(): void;

    /**
     * ブロックの実行後に呼ばれる（オプショナル）
     */
    afterExecute?(): void;

    /**
     * プロジェクト開始時に呼ばれる（オプショナル）
     */
    onProjectStart?(): void;

    /**
     * プロジェクト停止時に呼ばれる（オプショナル）
     */
    onProjectStop?(): void;

    /**
     * メニューアイテムを動的に生成する（オプショナル）
     * getInfo()のmenusでExtensionDynamicMenuが指定された場合に呼ばれる
     * @param menuName メニュー名
     * @returns メニューアイテムの配列
     */
    [K in ExtractMenuKeys<ReturnType<this['getInfo']>>]: MenuFunction;

    /**
     * ブロックの処理を実行する
     * getInfo()のblocksで定義されたopcodeやfuncに対応するメソッド
     * @param args ブロックの引数
     * @param util ブロックユーティリティ
     * @returns ブロックの戻り値
     */
    [K in ExtractBlockKeys<ReturnType<this['getInfo']>>]: BlockFunction;
}

// =========================================
// 拡張機能マネージャーのインターフェース
// =========================================
export interface IExtensionManager {
    /**
     * 拡張機能を登録する
     * @param extensionClass 拡張機能クラス
     */
    register(extensionClass: new (runtime: IRuntime) => IExtensionBlocks): void;

    /**
     * 拡張機能をロードする
     * @param extensionId 拡張機能ID
     */
    load(extensionId: string): void;

    /**
     * 拡張機能をアンロードする
     * @param extensionId 拡張機能ID
     */
    unload(extensionId: string): void;

    /**
     * 拡張機能がロードされているか確認する
     * @param extensionId 拡張機能ID
     */
    isLoaded(extensionId: string): boolean;

    /**
     * 拡張機能のインスタンスを取得する
     * @param extensionId 拡張機能ID
     */
    get(extensionId: string): IExtensionBlocks | undefined;
}

// getInfoの戻り値からBlockFunctionのキー型を抽出するヘルパー型
type ExtractBlockKeys<T extends ExtensionMetadata> = T extends { blocks: Array<infer B> }
    ? B extends { opcode: string, func?: string }
        ? B['opcode'] | NonNullable<B['func']>
        : never
    : never;

// getInfoの戻り値からMenuFunctionのキー型を抽出するヘルパー型
type ExtractMenuKeys<T extends ExtensionMetadata> = T extends { menus?: Record<string, infer M> }
    ? M extends { items: Array<infer I>, dynamicMenu?: string }
        ? keyof T['menus'] | (I extends string ? I : never) | NonNullable<M['dynamicMenu']>
        : never
    : never;

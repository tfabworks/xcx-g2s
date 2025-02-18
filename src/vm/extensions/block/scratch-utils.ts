import type { ExtensionManager, ExtensionBlockMetadata, ExtensionMenuMetadata, ExtensionArgumentMetadata, ExtensionDynamicMenu, ExtensionMenuItemSimple, ExtensionMenuItemComplex, ExtensionMenuItems } from './scratch-type';


// 現在実行中のブロック情報を文字列として取得する
function getCurrentBlockText(extensionInstance, args, util) {
    return getCurrentBlockInfo(extensionInstance, args, util).blockTextWithTop;
}



// 現在実行中の自身のブロック情報を取得する
function getCurrentBlockInfo(extensionInstance, args, util) {
    window.g2s_util = util;
    const extInfo = extensionInstance.getInfo();
    const blockId = util.thread.peekStack();
    const block = util.thread.blockContainer.getBlock(blockId);
    const opcodeGlobal = util.thread.blockContainer.getOpcode(block);
    const opcode = opcodeGlobal.split('_')[1];
    const mutation = util.thread.blockContainer.getMutation(block);
    const blockInfo = extInfo.blocks.find(b=>b.opcode === opcode);
    // 引数情報はcceptReportersのtrue/falseによってfieldsとinputsに分かれる
    // fieldsにはacceptReporters:falseな引数の情報が入っている
    const fields = Object.assign({}, util.thread.blockContainer.getFields(block) || {});
    for(const [key, field] of Object.entries(fields)) {
        const argMenu = blockInfo.arguments[key] ?  blockInfo.arguments[key].menu : null;
        const menu = {items: []};
        if (typeof argMenu === "string" && argMenu in extInfo.menus) {
            Object.assign(menu, extInfo.menus[argMenu]);
        }
        if(Array.isArray(argMenu)) {
            Object.assign(menu, {items: argMenu});
        }
        const menuItems = (menu.items || []);
        let menuItem = menuItems.find(item=>item.value === field.value);
        if(menuItem == null) {
            menuItem = menuItems.find(item=>String(item.value) === String(field.value));
        }
        const menuText = menuItem != null ? menuItem.text : null;
        Object.assign(field, {
            menu,
            menuItem,
            menuText
        });
    }
    // inputsにはレポーターブロックの情報が入っている（只の数字引数等も内部的にはmath_numberの様なshadowブロックが割り当てられている）
    const inputs = util.thread.blockContainer.getInputs(block);
    for(const [key, input] of Object.entries(inputs)) {
        const value = args[key];
        const blockInstance = util.thread.blockContainer.getBlock(input.block)
        // inputに設定されているブロックインスタンスが自分の拡張メニューの場合はメニュー情報を取得する
        if(blockInstance.opcode.startsWith(`${extInfo.id}_menu_`)) {
            const menuKey = blockInstance.opcode.replace(`${extInfo.id}_menu_`, '');
            const menu = extInfo.menus[menuKey];
            if(menu != null) {
                const menuItems = (menu.items || []);
                let menuItem = menuItems.find(item=>item.value === value);
                if(menuItem == null) {
                    menuItem = menuItems.find(item=>String(item.value) === String(value));
                }
                const menuText = menuItem != null ? menuItem.text : null;
                Object.assign(input, {
                    menu,
                    menuItem,
                    menuText,
                });
            }
        }
        Object.assign(input, {
            value: args[key],
            blockInstance,
        });
    }
    const blockText = blockInfo.text.replace(/\[(\w+)\]/g, (match, name) => {
        let value = args[name];
        if(typeof value !== 'string') {
            value = JSON.stringify(value)
        }
        for(const fieldOrInput of [fields[name], inputs[name]]) {
            if(fieldOrInput != null && fieldOrInput.menuText != null) {
                return `[${fieldOrInput.menuText}=${value}]`;
            }
        }
        return `[${value}]`;
    })

    return {
        /** @type {object} 現在実行中のブロックオブジェクト(プログラム上に配置され固有ID付きでインスタンス化されたもの) */
        block,
        /** @type {object} 拡張のgetInfo()で定義されたブロック情報 */
        blockInfo,
        /** @type {string} 拡張IDを名前空間プレフィックスとしたグローバルなopcode */
        opcodeGlobal,
        /** @type {string} 拡張内のローカルなopcode */
        opcode,
        /** @type {object} ブロックに渡された引数の値（引数に渡された値そのもの） */
        args,
        /** @type {object} ブロック引数のうちレポータ受け入れ不可のフィールド情報（acceptReporters:falseの引数）*/
        fields,
        /** @type {object} ブロック引数のうちレポータ受け入れ可能な入力欄のレポーターブロック情報(acceptReporters:trueの引数) */
        inputs,
        /** 何に使うのか要調査 */
        mutation,
        /** @type {string} ログ表示に便利な感じに整形したブロックのテキスト */
        blockText,
        /** @type {string} ログ表示に便利な感じに整形したブロックのテキスト */
        blockTextWithTop: `${util.thread.topBlock}>${blockText}`,
    };
}

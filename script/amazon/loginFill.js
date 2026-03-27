// ==UserScript==
// @name         Amazon TOTP Autofill (Multi Key)
// @namespace    https://api.luei.me
// @version      1.0.0
// @description  Amazon登录页自动填充
// @author       iiifox
// @include      https://sellercentral*.amazon.*/ap/mfa*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @downloadURL  https://api.luei.me/script/amazon/loginFill.js
// @updateURL    https://api.luei.me/script/amazon/loginFill.js
// ==/UserScript==

(async function(){
    'use strict';
    console.log('[TOTP-debug] script loaded', location.href);

    if(!location.pathname.startsWith('/ap/mfa')) return;

    const ref = document.referrer || '';
    const fromSignin = /\/ap\/signin/.test(ref);
    const fromRoot = ref === '' || /^https:\/\/sellercentral(?:-[a-z]+)?\.amazon\.[^\/]+\/?$/.test(ref);
    if(!fromSignin && !fromRoot) return;

    // ================== 密钥管理器 ==================
    let TOTP_SECRETS = await GM_getValue('TOTP_SECRETS', []);
    let ACTIVE_TOTP = await GM_getValue('ACTIVE_TOTP', null);

    async function saveSecrets() {
        await GM_setValue('TOTP_SECRETS', TOTP_SECRETS);
        await GM_setValue('ACTIVE_TOTP', ACTIVE_TOTP);
    }

    function getCurrentSecret() {
        const item = TOTP_SECRETS.find(i => i.id === ACTIVE_TOTP);
        return item ? item.secret : null;
    }

    function genId() {
        return Date.now() + "_" + Math.random().toString(36).slice(2);
    }

    // ➕ 添加
    GM_registerMenuCommand('➕ 添加 TOTP 密钥', async () => {
        const name = prompt("名称（例如：主号 / 小号）:");
        if (!name) return;

        const secret = prompt("输入 Base32 Secret:");
        if (!secret) return;

        const item = {
            id: genId(),
            name: name.trim(),
            secret: secret.trim()
        };

        TOTP_SECRETS.push(item);
        ACTIVE_TOTP = item.id;

        await saveSecrets();
        alert("添加成功（已设为当前密钥）");
        fillOnce();
    });

    // 🔁 切换
    GM_registerMenuCommand('🔁 切换 TOTP 密钥', async () => {
        if (TOTP_SECRETS.length === 0) {
            alert("没有密钥");
            return;
        }

        const list = TOTP_SECRETS.map((i, idx) => `${idx + 1}. ${i.name}`).join('\n');
        const input = prompt("选择编号：\n" + list);

        const index = parseInt(input) - 1;
        if (TOTP_SECRETS[index]) {
            ACTIVE_TOTP = TOTP_SECRETS[index].id;
            await saveSecrets();
            alert("已切换：" + TOTP_SECRETS[index].name);
            fillOnce();
        }
    });

    // ❌ 删除
    GM_registerMenuCommand('❌ 删除 TOTP 密钥', async () => {
        if (TOTP_SECRETS.length === 0) {
            alert("没有可删除的");
            return;
        }

        const list = TOTP_SECRETS.map((i, idx) => `${idx + 1}. ${i.name}`).join('\n');
        const input = prompt("删除哪个？\n" + list);

        const index = parseInt(input) - 1;
        if (TOTP_SECRETS[index]) {
            const removed = TOTP_SECRETS.splice(index, 1)[0];

            if (ACTIVE_TOTP === removed.id) {
                ACTIVE_TOTP = TOTP_SECRETS[0]?.id || null;
            }

            await saveSecrets();
            alert("已删除：" + removed.name);
        }
    });

    // 🧹 清空
    GM_registerMenuCommand('🧹 清空所有密钥', async () => {
        if (!confirm("确定清空？")) return;

        TOTP_SECRETS = [];
        ACTIVE_TOTP = null;
        await saveSecrets();

        alert("已清空");
    });

    if (!ACTIVE_TOTP && TOTP_SECRETS.length > 0) {
        ACTIVE_TOTP = TOTP_SECRETS[0].id;
        await saveSecrets();
    }

    if (TOTP_SECRETS.length === 0) {
        const first = prompt("请输入第一个 Base32 Secret:");
        if (first) {
            const item = {
                id: genId(),
                name: "默认",
                secret: first.trim()
            };
            TOTP_SECRETS.push(item);
            ACTIVE_TOTP = item.id;
            await saveSecrets();
        } else {
            return;
        }
    }
    // ==================================================

    function base32Decode(input) {
        input = (input||'').toUpperCase().replace(/=+$/,'').replace(/[^A-Z2-7]/g,'');
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        let bits = 0, value = 0, output = [];
        for (let i = 0; i < input.length; i++) {
            value = (value << 5) | alphabet.indexOf(input[i]);
            bits += 5;
            if (bits >= 8) {
                bits -= 8;
                output.push((value >>> bits) & 0xFF);
            }
        }
        return new Uint8Array(output);
    }

    function counterToBytes(counter) {
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);
        const hi = Math.floor(counter / Math.pow(2, 32));
        const lo = counter >>> 0;
        view.setUint32(0, hi);
        view.setUint32(4, lo);
        return new Uint8Array(buffer);
    }

    async function generateTOTP(base32secret, digits = 6, period = 30) {
        const keyBytes = base32Decode(base32secret);
        const now = Math.floor(Date.now() / 1000);
        const counter = Math.floor(now / period);
        const counterBytes = counterToBytes(counter);

        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'HMAC', hash: 'SHA-1' },
            false,
            ['sign']
        );

        const signature = await crypto.subtle.sign('HMAC', cryptoKey, counterBytes);
        const sigBytes = new Uint8Array(signature);
        const offset = sigBytes[sigBytes.length - 1] & 0x0f;

        const code =
            ((sigBytes[offset] & 0x7f) << 24) |
            ((sigBytes[offset+1] & 0xff) << 16) |
            ((sigBytes[offset+2] & 0xff) << 8) |
            (sigBytes[offset+3] & 0xff);

        return (code % Math.pow(10, digits)).toString().padStart(digits,'0');
    }

    const OTP_SELECTORS = [
        '#auth-mfa-otpcode',
        'input[name="otpCode"]',
        'input[name="otp"]',
        'input[id*="otp"]',
        'input[name*="mfa"]',
        'input[type="tel"]'
    ];

    function isVisible(el){
        return !!(el && (el.offsetWidth || el.offsetHeight));
    }

    function findOtpField(){
        for(const sel of OTP_SELECTORS){
            const el = document.querySelector(sel);
            if(el && isVisible(el)) return el;
        }
        return null;
    }

    async function fillOnce(){
        const secret = getCurrentSecret();
        if(!secret) return;

        const field = findOtpField();
        if(!field) return;

        try{
            const otp = await generateTOTP(secret);
            if(field.value !== otp){
                field.focus();
                field.value = otp;
                field.dispatchEvent(new Event('input',{bubbles:true}));
                field.dispatchEvent(new Event('change',{bubbles:true}));
                console.log('[TOTP] 填入:', otp);
            }
        }catch(e){
            console.error('[TOTP] error', e);
        }
    }

    const loopId = setInterval(fillOnce, 1000);

    const mo = new MutationObserver(()=>{
        if(findOtpField()) fillOnce();
    });
    mo.observe(document, { childList: true, subtree: true });

    window.addEventListener('beforeunload', ()=>{
        clearInterval(loopId);
        mo.disconnect();
    });

    fillOnce();

})();

// ==UserScript==
// @name         长颈鹿导出(结算版)
// @namespace    https://api.luei.me/
// @version      1.0.1
// @description  长颈鹿内附Qb算账简易版
// @author       luei
// @match        *://115.29.174.100:8369/dltj.aspx*
// @updateURL    https://api.luei.me/script/giraffe/suanzhang.js
// @downloadURL  https://api.luei.me/script/giraffe/suanzhang.js
// ==/UserScript==

(function () {
    'use strict';

    // ================== 配置 ==================
    const CONFIG = {
        启风: {name: ["I-qifeng"]},
        清黎: {name: ["I-qingli"]},
        Stars: {name: ["I-Stars", "I-Stars02"]},
        陆颜: {name: ["I-Lyan"]},
        宙曳: {name: ["I-zyzy"]},
        mandy: {name: ["I-mandy119"]},
        北辰: {name: ["I-beicheng"]},
        辣辣: {name: ["I-lala"], f: -0.002},
        my: {name: ["I-jiubie"]},
        tt: {name: ["I-tt"]},
        icbc: {name: ["I-All-in"]},
        桃桃: {name: ["I-tao"]},
        抖音晚安: {name: ["I-wan"]},
        猫腻: {name: ["I-maoni"]},
        匿名: {name: ["I-niming"]},
    };

    // ================== 数据缓存 ==================
    let dataStore = {}; // {date: data[]}
    let pendingData = null;

    // ================== 拦截 ==================
    const hook = (parsed) => {
        if (!parsed) return;
        console.log("检测到数据:", parsed);
        pendingData = parsed;
        dataStore[parsed.dateStr] = parsed.data;
        updateUI();
    };

    (function () {
        const originalSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function (...args) {
            this.addEventListener('load', () => {
                if (this.readyState === 4 && this.status === 200) {
                    const parsed = parseResponseText(this.responseText);
                    hook(parsed);
                }
            });
            return originalSend.apply(this, args);
        };
    })();

    // ================== 解析 ==================
    function parseResponseText(text) {
        if (!text || !text.includes('"Text":"')) return null;

        const dateMatch = text.match(/"Text":"(\d{4}-\d{2}-\d{2})"/);
        const dateStr = dateMatch ? dateMatch[1] : "未知日期";

        const rowsMatch = text.match(/"F_Rows":(\[.*?\])\}/s);
        if (!rowsMatch) return null;
        let rows = JSON.parse(rowsMatch[1]);
        const data = rows.map(r => {
            const f0 = r.f0;
            return [String(f0[1]), String(f0[2]), Number(f0[3])];
        });
        return {dateStr, data};
    }

    // ================== UI ==================
    function createUI() {
        const box = document.createElement('div');
        box.id = 'fox-ui';
        box.style = `
            position: fixed;
            top: 50px;
            right: 20px;
            z-index: 9999;
            background: #fff;
            border: 1px solid #ccc;
            padding: 12px;
            width: 320px;
            font-size: 12px;
        `;

        box.innerHTML = `
            <div>
                日期：
                <select id="fox-date"></select>
            </div>
            <div>
                折扣：
                <input id="fox-discount" value="0.895" style="width:60px">
            </div>
            <button id="fox-calc">计算</button>
            <pre id="fox-output" style="max-height:300px;overflow:auto;"></pre>
        `;

        document.body.appendChild(box);

        document.getElementById('fox-calc').onclick = calc;
    }

    function updateUI() {
        if (!document.getElementById('fox-ui')) createUI();

        const select = document.getElementById('fox-date');
        select.innerHTML = Object.keys(dataStore)
            .map(d => `<option value="${d}">${d}</option>`)
            .join('');
    }

    // ================== 核心计算 ==================
    function calc() {
        const date = document.getElementById('fox-date').value;
        const discount = Number(document.getElementById('fox-discount').value);
        const data = dataStore[date];
        if (!data) return;

        let result = [];
        let grandTotal = 0;
        for (let group in CONFIG) {
            const conf = CONFIG[group];
            const names = conf.name;
            const extra = conf.f || 0;

            let total = 0;
            let detail = [];
            data.forEach(([name, type, money]) => {
                if (type !== "内附Qb") return;
                if (names.includes(name)) {
                    total += money;
                    detail.push(`${name}:${money}`);
                }
            });
            grandTotal += total;
            if (total === 0) continue;

            const finalDiscount = discount + extra;
            const finalMoney = total * finalDiscount;
            // 输出格式
            if (names.length === 1) {
                result.push(`${group}: ${total}*${finalDiscount}=${finalMoney.toFixed(2)}`);
            } else {
                result.push(`${group}: ${total}*${finalDiscount}=${finalMoney.toFixed(2)}（${detail.join(', ')}）`);
            }
        }

        if (grandTotal > 0) {
            const final = grandTotal * discount;
            result.push(`\n总计: ${grandTotal}*${discount}=${final.toFixed(2)}`);
        } else {
            result.push("当日无消费记录")
        }

        document.getElementById('fox-output').textContent = result.join('\n');
    }

})();

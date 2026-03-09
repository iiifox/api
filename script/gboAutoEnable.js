// ==UserScript==
// @name         gbo自动启用
// @namespace    https://api.luei.me
// @version      1.1.3
// @description  自动检测并每3分钟启用一次被异常停用的账号
// @author       luei
// @match        *://hxff.g8b8o8.xyz/*
// @match        *://hxff.oog00.xyz/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      ggbboo.xyz
// @connect      api.luei.me
// @updateURL    https://api.luei.me/script/gboAutoEnable.js
// @downloadURL  https://api.luei.me/script/gboAutoEnable.js
// ==/UserScript==

(function () {
    'use strict';

    // 封装 POST 请求
    function postRequest(url, data) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: url,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                data: new URLSearchParams(data).toString(),
                onload: function (resp) {
                    try {
                        resolve(JSON.parse(resp.responseText));
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: function (err) {
                    reject(err);
                }
            });
        });
    }

    // 封装 GET 请求
    function getRequest(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                onload: function (resp) {
                    try {
                        resolve(JSON.parse(resp.responseText));
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: function (err) {
                    reject(err);
                }
            });
        });
    }

    // 获取执行间隔（分钟）
    function getIntervalMinutes() {
        return Number(localStorage.getItem("gbo_interval")) || 3;
    }

    // 设置执行间隔
    GM_registerMenuCommand("设置自动启用间隔", () => {
        let current = getIntervalMinutes();
        let val = prompt("请输入执行间隔（分钟）", current);

        if (!val) return;

        let num = Number(val);
        if (num <= 0 || isNaN(num)) {
            alert("请输入有效数字");
            return;
        }

        localStorage.setItem("gbo_interval", num);
        alert("设置成功，刷新页面生效");
    });

    async function getAccountExceptIds(username, sid) {
        let ids = [];
        let getAccountListUrl = "http://api.ggbboo.xyz/api_group/Account/getAccountList";
        let disableData = {page: 1, limit: 20, username: username, sid: sid, state: 0};

        while (true) {
            let resp = await postRequest(getAccountListUrl, disableData);
            let items = resp?.data?.list || [];

            for (let item of items) {
                let limit_order_money = item.limit_order_money;
                let limit_order_amount = item.limit_order_amount;

                // 限额到了上限
                if (limit_order_money !== 0 && limit_order_money < item.total_money + item.minimum_limit) {
                    continue;
                }
                // 限笔到了上限
                if (limit_order_amount !== 0 && limit_order_amount <= item.total_amount) {
                    continue;
                }

                // 可以启用了
                ids.push(item.id);
            }

            if (items.length < disableData.limit) {
                break;
            }
            disableData.page++;
        }
        return ids;
    }

    async function enableAccount(username, sid, ids) {
        if (ids.length === 0) {
            console.log("没有需要重新启用的账号~");
            return;
        }

        let enableUrl = "http://api.ggbboo.xyz/api_group/Account/updateAccountState";
        let enableData = {username: username, sid: sid, is_sub: 1, state: 1, "ids[]": ids};
        let resp = await postRequest(enableUrl, enableData);

        if (resp?.msg === "修改成功") {
            ids.forEach(id => console.log(`账号ID: ${id} 被异常停用，已重新启用`));
        } else {
            ids.forEach(id => console.log(`账号ID: ${id} 被异常停用，尝试启用失败~`));
        }
    }

    async function main(username, sid) {
        let ids = await getAccountExceptIds(username, sid);
        await enableAccount(username, sid, ids);
    }

    // 页面加载后执行
    window.addEventListener("load", () => {
        setTimeout(() => {
            let username = localStorage.getItem("username");
            let sid = localStorage.getItem("sid");

            if (!username || !sid) {
                console.log("未找到 localStorage 中的 username 或 sid");
                return;
            }

            // 启动定时任务，每3分钟执行一次
            main(username, sid); // 先执行一次
            setInterval(() => main(username, sid), getIntervalMinutes() * 60 * 1000);
        }, 2000);
    });
})();

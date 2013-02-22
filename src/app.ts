declare interface Window {
  chrome: any;
}

declare interface Location {
  origin: string;
}

declare var webkitNotifications: any;
declare var chrome: any;
declare var $: any;

module app {
  "use strict";

  var logLevels = ["log", "debug", "info", "warn", "error"];

  export function criticalError (message:string):void {
    webkitNotifications
      .createNotification(
        "",
        "深刻なエラーが発生したのでread.crxを終了します",
        "詳細 : " + message
      )
      .show()

    parent.chrome.tabs.getCurrent(function (tab):void {
      parent.chrome.tabs.remove(tab.id);
    });
  }
  export var clitical_error = criticalError;

  export function log (level:string, ...data:any[]) {
    if (logLevels.indexOf(level) !== -1) {
      console[level].apply(console, data);
    }
    else {
      log("error", "app.log: 引数levelが不正な値です", arguments);
    }
  }

  export function deepCopy (src:any):any {
    var copy:any, key:string;

    if (typeof src !== "object" || src === null) {
      return src;
    }

    if (Array.isArray(src)) {
      copy = [];
    }
    else {
      copy = {};
    }

    for (key in src) {
      copy[key] = deepCopy(src[key]);
    }

    return copy;
  }
  export var deep_copy = deepCopy;

  export function defer (fn:Function):void {
    setTimeout(fn, 0);
  }

  export function assert_arg (name:string, rule:string[], arg:any[]):bool {
    var key:number, val:any;

    for (key = 0; val = rule[key]; key++) {
      if (typeof arg[key] !== val) {
        log("error", name + ": 不正な引数", deepCopy(arg));
        return true;
      }
    }

    return false;
  }

  export interface CallbacksConfiguration {
    persistent?: bool;
  }
  export class Callbacks {
    private _config: CallbacksConfiguration;
    private _callbackStore:Function[] = [];
    private _latestCallArg: any[] = null;

    constructor (config:CallbacksConfiguration = {}) {
      this._config = config;
    }

    add (callback:Function):void {
      if (!this._config.persistent && this._latestCallArg) {
        callback.apply(null, deepCopy(this._latestCallArg));
      }
      else {
        this._callbackStore.push(callback);
      }
    }

    remove (callback:() => any):void {
      var index:number;

      index = this._callbackStore.indexOf(callback);
      if (index !== -1) {
        this._callbackStore.splice(index, 1);
      }
      else {
        log("error",
          "app.Callbacks: 存在しないコールバックを削除しようとしました。");
      }
    }

    call (...arg:any[]):void {
      var key:number, callback:() => void, tmpCallbackStore;

      if (!this._config.persistent && this._latestCallArg) {
        app.log("error",
          "app.Callbacks: persistentでないCallbacksが複数回callされました。");
      }
      else {
        this._latestCallArg = deepCopy(arg);

        tmpCallbackStore = this._callbackStore.slice(0);

        for (key = 0; callback = tmpCallbackStore[key]; key++) {
          if (this._callbackStore.indexOf(callback) !== -1) {
            callback.apply(null, deepCopy(arg));
          }
        }

        if (!this._config.persistent) {
          this._callbackStore = null;
        }
      }
    }
  }

  export class Message {
    private _listenerStore:{[index:string]:Callbacks;} = {};

    constructor () {
      window.addEventListener("message", (e:MessageEvent) => {
        if (e.origin !== location.origin) return;

        var data = JSON.parse(e.data), iframes, key:number,
          iframe:HTMLIFrameElement;

        if (data.type !== "app.message") return;

        if (data.propagation !== false) {
          iframes = document.getElementsByTagName("iframe");

          // parentから伝わってきた場合はiframeにも伝える
          if (e.source === parent) {
            for (key = 0; iframe = iframes[key]; key++) {
              iframe.contentWindow.postMessage(e.data, location.origin);
            }
          }
          // iframeから伝わってきた場合は、parentと他のiframeにも伝える
          else {
            if (parent !== window) {
              parent.postMessage(e.data, location.origin);
            }

            for (key = 0; iframe = iframes[key]; key++) {
              if (iframe.contentWindow === e.source) continue;
              iframe.contentWindow.postMessage(e.data, location.origin);
            }
          }
        }

        this._fire(data.message_type, data.message);
      });
    }

    private _fire (type:string, message:any):void {
      var message = deepCopy(message);

      defer(() => {
        if (this._listenerStore[type]) {
          this._listenerStore[type].call(message);
        }
      });
    }

    send (type:string, message:any, targetWindow?:Window):void {
      var json:string, iframes, key:number, iframe:HTMLIFrameElement;

      json = JSON.stringify({
        type: "app.message",
        message_type: type,
        message: message,
        propagation: !targetWindow
      });

      if (targetWindow) {
        targetWindow.postMessage(json, location.origin);
      }
      else {
        if (parent !== window) {
          parent.postMessage(json, location.origin);
        }

        iframes = document.getElementsByTagName("iframe");
        for (key = 0; iframe = iframes[key]; key++) {
          iframe.contentWindow.postMessage(json, location.origin);
        }
        this._fire(type, message);
      }
    }

    addListener (type:string, listener:() => void) {
      if (!this._listenerStore[type]) {
        this._listenerStore[type] = new app.Callbacks({persistent: true});
      }
      this._listenerStore[type].add(listener);
    }

    removeListener (type:string, listener:() => void) {
      if (this._listenerStore[type]) {
        this._listenerStore[type].remove(listener);
      }
    }
  }
  export var message = new Message();
  (<any>message).add_listener = message.addListener;
  (<any>message).remove_listener = message.removeListener;

  export class Config {
    static private _default = {
      aa_font: "aa",
      thumbnail_supported: "on",
      always_new_tab: "on",
      layout: "pane-3",
      default_name: "",
      default_mail: "",
      popup_trigger: "click",
      theme_id: "default",
      user_css: ""
    };

    private _cache:{[index:string]:string;} = {};
    ready: Function;
    _onChanged: any;

    constructor () {
      var ready = new Callbacks();
      this.ready = ready.add.bind(ready);

      // localStorageからの移行処理
      (() => {
        var found:{[index:string]:string;} = {}, index:number, key:string,
          val:string;

        for (index = 0; index < localStorage.length; index++) {
          key = localStorage.key(index);
          if (/^config_/.test(key)) {
            val = localStorage.getItem(key);
            this._cache[key] = val;
            found[key] = val;
          }
        }

        chrome.storage.local.set(found);

        for (key in found) {
          localStorage.removeItem(key);
        }
      })();

      chrome.storage.local.get(null, (res) => {
        var key:string, val:any;
        if (this._cache !== null) {
          for (key in res) {
            val = res[key];

            if (
              /^config_/.test(key) &&
              (typeof val === "string" || typeof val ==="number")
            ) {
              this._cache[key] = val;
            }
          }
          ready.call();
        }
      });

      this._onChanged = (change, area) => {
        var key:string, info;

        if (area === "local") {
          for (key in change) {
            if (!/^config_/.test(key)) continue;

            info = change[key];
            if (typeof info.newValue === "string") {
              this._cache[key] = info.newValue;

              app.message.send("config_updated", {
                key: key.slice(7),
                val: info.newValue
              });
            }
            else {
              delete this._cache[key];
            }
          }
        }
      };

      chrome.storage.onChanged.addListener(this._onChanged);
    }

    get (key:string):string {
      if (this._cache["config_" + key] != null) {
        return this._cache["config_" + key];
      }
      else if (Config._default[key] != null) {
        return Config._default[key];
      }
      else {
        return undefined;
      }
    }

    set (key:string, val:string):void {
      var tmp = {};

      if (
        typeof key !== "string" ||
        !(typeof val === "string" || typeof val === "number")
      ) {
        log("error", "app.Config::setに不適切な値が渡されました",
          arguments);
        return;
      }

      tmp["config_" + key] = val;
      chrome.storage.local.set(tmp);
    }

    del (key:string):void {
      if (typeof key !== "string") {
        log("error", "app.Config::delにstring以外の値が渡されました",
          arguments);
      }

      chrome.storage.local.remove("config_" + key);
    }

    destroy ():void {
      this._cache = null;
      chrome.storage.onChanged.removeListener(this._onChanged);
    }
  }

  export var config: Config;
  if (!frameElement) {
    config = new Config();
  }

  export function escape_html (str:string):string {
    return str
      .replace(/\&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  export function safe_href (url:string):string {
    return /^https?:\/\//.test(url) ? url : "/view/empty.html";
  }

  export var manifest;

  (function () {
    var xhr:XMLHttpRequest;

    if (/^chrome-extension:\/\//.test(location.origin)) {
      xhr = new XMLHttpRequest();
      xhr.open("GET", "/manifest.json", false);
      xhr.send();
      manifest = JSON.parse(xhr.responseText);
    }
  })();

  export function clipboardWrite (str:string):void {
    var textarea:HTMLTextAreaElement;

    textarea = <HTMLTextAreaElement>document.createElement("textarea");
    textarea.value = str;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }

  export var module;
  (function () {
    var pending_modules = [], ready_modules = {}, fire_definition,
      add_ready_module;

    fire_definition = function (module_id, dependencies, definition) {
      var dep_modules = [], key, dep_module_id, callback;

      for (key = 0; dep_module_id = dependencies[key]; key++) {
        dep_modules.push(ready_modules[dep_module_id].module);
      }

      if (module_id !== null) {
        callback = add_ready_module.bind({
          module_id: module_id,
          dependencies: dependencies
        });
        defer(function () {
          definition.apply(null, dep_modules.concat(callback));
        });
      }
      else {
        defer(function () {
          definition.apply(null, dep_modules);
        });
      }
    };

    add_ready_module = function (module) {
      ready_modules[this.module_id] = {
        dependencies: this.dependencies,
        module: module
      };

      // このモジュールが初期化された事で依存関係が満たされたモジュールを初期化
      pending_modules = pending_modules.filter((val) => {
        if (val.dependencies.indexOf(this.module_id) !== -1) {
          if (!val.dependencies.some(function (a) { return !ready_modules[a]; })) {
            fire_definition(val.module_id, val.dependencies, val.definition);
            return false;
          }
        }
        return true;
      });
    };

    app.module = function (module_id, dependencies, definition) {
      if (!dependencies) dependencies = [];

      // 依存関係が満たされていないモジュールは、しまっておく
      if (dependencies.some(function (a) { return !ready_modules[a]; })) {
        pending_modules.push({
          module_id: module_id,
          dependencies: dependencies,
          definition: definition
        });
      }
      // 依存関係が満たされている場合、即座にモジュール初期化を開始する
      else {
        fire_definition(module_id, dependencies, definition);
      }
    };

    if (window["jQuery"]) {
      app.module("jquery", [], function (callback) {
        callback(window["jQuery"]);
      });
    }
  })();

  export function boot (path:string, requirements, fn):void {
    var htmlVersion:string;

    if (!fn) {
      fn = requirements;
      requirements = null;
    }

    // Chromeがiframeのsrcと無関係な内容を読み込むバグへの対応
    if (
      frameElement &&
      (<HTMLIFrameElement>frameElement).src !== location.href
    ) {
      location.href = (<HTMLIFrameElement>frameElement).src;
      return;
    }

    if (location.pathname === path) {
      htmlVersion = document.documentElement.getAttribute("data-app-version");
      if (manifest.version !== htmlVersion) {
        location.reload(true);
      }
      else {
        $(function () {
          app.config.ready(function () {
            if (requirements) {
              app.module(null, requirements, fn);
            }
            else {
              fn();
            }
          });
        });
      }
    }
  }
}

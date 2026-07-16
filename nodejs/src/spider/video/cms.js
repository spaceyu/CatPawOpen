/*! @chrisdiana/cmsjs v2.0.1 Optimized | MIT (c) 2021 Chris Diana | Modified 2026 */
var CMS = (function () {
  'use strict';

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  function _defineProperties(target, props) {
    for (var i = 0; i < props.length; i++) {
      var descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;
      if ("value" in descriptor) descriptor.writable = true;
      Object.defineProperty(target, descriptor.key, descriptor);
    }
  }

  function _createClass(Constructor, protoProps, staticProps) {
    if (protoProps) _defineProperties(Constructor.prototype, protoProps);
    if (staticProps) _defineProperties(Constructor, staticProps);
    return Constructor;
  }

  var defaults = {
    elementId: null,
    layoutDirectory: null,
    defaultView: null,
    errorLayout: null,
    mode: 'SERVER',
    github: null,
    types: [],
    plugins: [],
    frontMatterSeperator: /^---$/m,
    listAttributes: ['tags'],
    dateParser: /\d{4}-\d{2}(?:-\d{2})?/,
    dateFormat: function dateFormat(date) {
      return [date.getMonth() + 1, date.getDate(), date.getFullYear()].join('/');
    },
    extension: '.md',
    sort: undefined,
    markdownEngine: null,
    debug: false,
    messageClassName: 'cms-messages',
    onload: function onload() {},
    onroute: function onroute() {},
    cacheEnable: true, // 新增：文件缓存开关
    cacheTTL: 3600000 // 缓存1小时
  };

  var messageContainer;
  var fileCache = new Map(); // 新增：全局文件缓存
  var messages = {
    NO_FILES_ERROR: 'ERROR: No files in directory',
    ELEMENT_ID_ERROR: 'ERROR: No element ID or ID incorrect. Check "elementId" parameter in config.',
    DIRECTORY_ERROR: 'ERROR: Error getting files. Make sure there is a directory for each type in config with files in it.',
    GET_FILE_ERROR: 'ERROR: Error getting the file',
    LAYOUT_LOAD_ERROR: 'ERROR: Error loading layout. Check the layout file to make sure it exists.',
    NOT_READY_WARNING: 'WARNING: Not ready to perform action',
    ROUTE_404: 'WARNING: Route not found, render error layout'
  };

  function createMessageContainer(classname) {
    messageContainer = document.createElement('div');
    messageContainer.className = classname;
    messageContainer.style.background = '#ff3333';
    messageContainer.style.color = '#fff';
    messageContainer.style.padding = '8px 12px';
    messageContainer.style.position = 'fixed';
    messageContainer.style.top = '0';
    messageContainer.style.left = '0';
    messageContainer.style.zIndex = '9999';
    messageContainer.style.maxWidth = '100%';
    document.body.appendChild(messageContainer);
  }

  function handleMessage(debug, message) {
    if (!debug || !messageContainer) return;
    messageContainer.innerHTML = message;
    return message;
  }

  // 增强GET：增加缓存、异常捕获
  function get(url, callback, cacheCfg) {
    if (cacheCfg && cacheCfg.cacheEnable) {
      var cacheItem = fileCache.get(url);
      if (cacheItem && Date.now() - cacheItem.time < cacheCfg.cacheTTL) {
        callback(cacheItem.data, false);
        return;
      }
    }
    var req = new XMLHttpRequest();
    req.open('GET', url, true);
    req.onerror = function () {
      callback(null, 'Network Error');
    };
    req.onreadystatechange = function () {
      if (req.readyState === 4) {
        if (req.status === 200) {
          if (cacheCfg && cacheCfg.cacheEnable) {
            fileCache.set(url, { data: req.response, time: Date.now() });
          }
          callback(req.response, false);
        } else {
          callback(req, req.statusText || 'Request Failed');
        }
      }
    };
    req.send();
  }

  function extend(target, opts, callback) {
    if (opts === undefined) opts = {};
    for (var next in opts) {
      if (Object.prototype.hasOwnProperty.call(opts, next)) {
        target[next] = opts[next];
      }
    }
    if (typeof callback === 'function') callback();
    return target;
  }

  function getFunctionName(func) {
    if (!func || typeof func !== 'function') return '';
    var ret = func.toString();
    ret = ret.substr('function '.length);
    ret = ret.substr(0, ret.indexOf('('));
    return ret.trim();
  }

  function isValidFile(fileUrl, extension) {
    if (!fileUrl) return false;
    var ext = fileUrl.split('.').pop();
    var targetExt = extension.replace('.', '');
    return ext === targetExt || ext === 'html';
  }

  function getPathsWithoutParameters() {
    return window.location.hash.split('/')
      .map(function (path) {
        var qIdx = path.indexOf('?');
        return qIdx >= 0 ? path.substring(0, qIdx) : path;
      })
      .filter(function (path) {
        return path !== '' && path !== '#';
      });
  }

  function getParameterByName(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[[]]/g, '\\$&');
    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');
    var results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
  }

  function getGithubUrl(type, gh) {
    var urlParts = [gh.host || 'https://api.github.com', 'repos', gh.username, gh.repo, 'contents'];
    if (gh.prefix) urlParts.push(gh.prefix);
    urlParts.push(type + '?ref=' + gh.branch);
    return urlParts.join('/');
  }

  function getDatetime(dateStr) {
    var dt = new Date(dateStr);
    if (isNaN(dt.getTime())) return new Date();
    return new Date(dt.getTime() + dt.getTimezoneOffset() * 60000);
  }

  function getFilenameFromPath(filepath) {
    return filepath.split(/[\\/]/).pop() || '';
  }

  function Templater(text) {
    var tplStr = JSON.stringify(text)
      .replace(/<%=(.+?)%>/g, '"+($1)+"')
      .replace(/<%(.+?)%>/g, '";$1\noutput+="');
    return new Function('data', 'var output=' + tplStr + ';return output;');
  }

  function loadTemplate(url, data, config, callback) {
    get(url, function (success, error) {
      if (error) return callback(null, error);
      try {
        var renderFn = Templater(success);
        var html = renderFn(data || {});
        callback(html, null);
      } catch (e) {
        callback(null, 'Template parse error: ' + e.message);
      }
    }, config);
  }

  function renderLayout(layout, config, data) {
    if (!config.container) return;
    config.container.innerHTML = '';
    var url = [config.layoutDirectory, '/', layout, '.html'].join('');
    loadTemplate(url, data, config, function (success, error) {
      if (error) {
        handleMessage(config.debug, messages['LAYOUT_LOAD_ERROR'] + ' ' + error);
      } else {
        config.container.innerHTML = success;
      }
    });
  }

  var Markdown = /*#__PURE__*/function () {
    function Markdown() {
      _classCallCheck(this, Markdown);
      this.rules = [
        { regex: /(#+)(.*)/g, replacement: function (text, chars, content) {
            return '<h' + chars.length + '>' + content.trim() + '</h' + chars.length + '>';
        }},
        { regex: /!\[([^[\]]+)\]\(([^)]+)\)/g, replacement: '<img src="$2" alt="$1" loading="lazy">' },
        { regex: /\[([^[\]]+)\]\(([^)]+)\)/g, replacement: '<a href="$2">$1</a>' },
        { regex: /(\*\*|__)(.*?)\1/g, replacement: '<strong>$2</strong>' },
        { regex: /(\*|_)(.*?)\1/g, replacement: '<em>$2</em>' },
        { regex: /~~(.*?)~~/g, replacement: '<del>$1</del>' },
        { regex: /:"(.*?)":/g, replacement: '<q>$1</q>' },
        { regex: /```[a-z0-9]*\n([\s\S]*?)\n```/g, replacement: function (m, c) {
            return '<pre><code>' + c.trim() + '</code></pre>';
        }},
        { regex: /`([^`]+)`/g, replacement: '<code>$1</code>' },
        { regex: /\n\* (.*)/g, replacement: '\n<li>$1</li>' },
        { regex: /\n(\d+)\. (.*)/g, replacement: '\n<li>$2</li>' },
        { regex: /\n> (.*)/g, replacement: '\n<blockquote>$1</blockquote>' },
        { regex: /\n-{5,}/g, replacement: '\n<hr>' },
        { regex: /\n([^\n]+)\n/g, replacement: function (m, line) {
            var trim = line.trim();
            if (/^<\/?(ul|ol|li|h|p|blockquote|pre|code)/i.test(trim)) return '\n' + line;
            return '\n<p>' + trim + '</p>';
        }},
        { regex: /<\/ul>\s*<ul>/g, replacement: '' },
        { regex: /<\/ol>\s*<ol>/g, replacement: '' },
        { regex: /<\/blockquote><blockquote>/g, replacement: '\n' }
      ];
    }
    _createClass(Markdown, [{
      key: "render",
      value: function render(text) {
        if (!text) return '';
        var html = '\n' + text + '\n';
        this.rules.forEach(function (r) {
          html = html.replace(r.regex, r.replacement);
        });
        // 补全列表包裹
        html = html.replace(/(<li>.+<\/li>)(\s*<li>.+<\/li>)+/g, function (lis) {
          return '<ul>' + lis + '</ul>';
        });
        return html.trim();
      }
    }]);
    return Markdown;
  }();

  var File = /*#__PURE__*/function () {
    function File(url, type, layout, config) {
      _classCallCheck(this, File);
      this.url = type === 'SERVER' ? type + '/' + url : url;
      this.type = type;
      this.layout = layout;
      this.config = config;
      this.html = false;
      this.content = '';
      this.name = '';
      this.extension = config.extension;
      this.title = '';
      this.excerpt = '';
      this.date = '';
      this.datetime = null;
      this.author = '';
      this.body = '';
      this.permalink = '';
      this.tags = [];
    }
    _createClass(File, [{
      key: "getContent",
      value: function getContent(callback) {
        var _this = this;
        get(this.url, function (success, error) {
          if (error) return callback(null, error);
          _this.content = success;
          callback(success, null);
        }, this.config);
      }
    }, {
      key: "parseFrontMatter",
      value: function parseFrontMatter() {
        var parts = this.content.split(this.config.frontMatterSeperator);
        if (parts.length < 3) return;
        var yaml = parts[1].trim();
        if (!yaml) return;
        var lines = yaml.split('\n');
        var attrs = {};
        lines.forEach(function (line) {
          line = line.trim();
          if (!line || line.startsWith('#')) return;
          var colonIdx = line.indexOf(':');
          if (colonIdx <= 0) return;
          var key = line.slice(0, colonIdx).trim();
          var val = line.slice(colonIdx + 1).trim();
          attrs[key] = val;
        });
        extend(this, attrs);
      }
    }, {
      key: "setListAttributes",
      value: function setListAttributes() {
        var _this2 = this;
        this.config.listAttributes.forEach(function (attr) {
          if (!_this2[attr]) return;
          if (typeof _this2[attr] === 'string') {
            _this2[attr] = _this2[attr].split(',').map(function (i) { return i.trim(); }).filter(Boolean);
          }
        });
      }
    }, {
      key: "setFilename",
      value: function setFilename() {
        var fullName = getFilenameFromPath(this.url);
        this.name = fullName.replace(this.config.extension, '').replace('.html', '');
      }
    }, {
      key: "setPermalink",
      value: function setPermalink() {
        this.permalink = '#/' + [this.type, this.name].join('/');
      }
    }, {
      key: "setDate",
      value: function setDate() {
        var reg = new RegExp(this.config.dateParser);
        if (this.date) {
          this.datetime = getDatetime(this.date);
          this.date = this.config.dateFormat(this.datetime);
        } else if (reg.test(this.url)) {
          var match = reg.exec(this.url)[0];
          this.datetime = getDatetime(match);
          this.date = this.config.dateFormat(this.datetime);
        }
      }
    }, {
      key: "setBody",
      value: function setBody() {
        var contentParts = this.content.split(this.config.frontMatterSeperator);
        var rawBody = contentParts.slice(2).join('---').trim();
        if (this.html) {
          this.body = rawBody;
        } else {
          if (typeof this.config.markdownEngine === 'function') {
            this.body = this.config.markdownEngine(rawBody);
          } else {
            var md = new Markdown();
            this.body = md.render(rawBody);
          }
        }
      }
    }, {
      key: "parseContent",
      value: function parseContent() {
        this.setFilename();
        this.setPermalink();
        this.parseFrontMatter();
        this.setListAttributes();
        this.setDate();
        this.setBody();
      }
    }, {
      key: "render",
      value: function render() {
        renderLayout(this.layout.single, this.config, this);
      }
    }]);
    return File;
  }();

  var FileCollection = /*#__PURE__*/function () {
    function FileCollection(type, layout, config) {
      _classCallCheck(this, FileCollection);
      this.type = type;
      this.layout = layout;
      this.config = config;
      this.files = [];
      this[this.type] = [];
    }
    _createClass(FileCollection, [{
      key: "init",
      value: function init(callback) {
        var _this = this;
        this.getFiles(function (success, error) {
          if (error) handleMessage(_this.config.debug, messages['DIRECTORY_ERROR'] + ' ' + error);
          _this.loadFiles(callback);
        });
      }
    }, {
      key: "getFileListUrl",
      value: function () {
        return this.config.mode === 'GITHUB' ? getGithubUrl(this.type, this.config.github) : this.type;
      }
    }, {
      key: "getFileUrl",
      value: function (fileItem) {
        if (this.config.mode === 'GITHUB') return fileItem.download_url;
        var href = fileItem.getAttribute('href');
        return this.type + '/' + getFilenameFromPath(href);
      }
    }, {
      key: "getFileElements",
      value: function (rawData) {
        if (this.config.mode === 'GITHUB') return JSON.parse(rawData);
        var wrap = document.createElement('div');
        wrap.innerHTML = rawData;
        return Array.from(wrap.querySelectorAll('a'));
      }
    }, {
      key: "getFiles",
      value: function (callback) {
        var _this2 = this;
        get(this.getFileListUrl(), function (success, error) {
          if (error) return callback(null, error);
          var items = _this2.getFileElements(success);
          items.forEach(function (item) {
            var url = _this2.getFileUrl(item);
            if (isValidFile(url, _this2.config.extension)) {
              _this2.files.push(new File(url, _this2.type, _this2.layout, _this2.config));
            }
          });
          callback(success, null);
        }, this.config);
      }
    }, {
      key: "loadFiles",
      value: function (callback) {
        var _this3 = this;
        var loadedCount = 0;
        var total = this.files.length;
        if (total === 0) return callback(null, messages.NO_FILES_ERROR);
        this.files.forEach(function (file) {
          file.getContent(function (_, err) {
            if (err) handleMessage(_this3.config.debug, messages.GET_FILE_ERROR + ' ' + err);
            file.parseContent();
            loadedCount++;
            if (loadedCount >= total) callback(null, null);
          });
        });
      }
    }, {
      key: "search",
      value: function (attr, keyword) {
        var kw = keyword.toLowerCase().trim();
        this[this.type] = this.files.filter(function (f) {
          var val = String(f[attr] || '').toLowerCase();
          return val.includes(kw);
        });
      }
    }, {
      key: "resetSearch",
      value: function () {
        this[this.type] = [...this.files];
      }
    }, {
      key: "getByTag",
      value: function (tagName) {
        var t = tagName.trim();
        this[this.type] = this.files.filter(function (f) {
          return Array.isArray(f.tags) && f.tags.includes(t);
        });
      }
    }, {
      key: "getFileByPermalink",
      value: function (link) {
        return this.files.find(function (f) { return f.permalink === link; }) || null;
      }
    }, {
      key: "render",
      value: function () {
        renderLayout(this.layout.list, this.config, this);
      }
    }]);
    return FileCollection;
  }();

  var CMS = /*#__PURE__*/function () {
    function CMS(view, options) {
      _classCallCheck(this, CMS);
      this.ready = false;
      this.collections = {};
      this.state = '';
      this.view = view;
      this.config = Object.assign({}, defaults, options || {});
      this.init();
    }
    _createClass(CMS, [{
      key: "init",
      value: function () {
        var _this = this;
        if (this.config.debug) createMessageContainer(this.config.messageClassName);
        if (!this.config.elementId) {
          handleMessage(this.config.debug, messages.ELEMENT_ID_ERROR);
          return;
        }
        this.config.container = document.getElementById(this.config.elementId);
        if (!this.config.container) {
          handleMessage(this.config.debug, messages.ELEMENT_ID_ERROR);
          return;
        }
        this.initFileCollections(function () {
          _this.view.addEventListener('hashchange', _this.route.bind(_this), false);
          _this.view.dispatchEvent(new HashChangeEvent('hashchange'));
          _this.ready = true;
          _this.registerPlugins();
          _this.config.onload();
        });
      }
    }, {
      key: "initFileCollections",
      value: function (callback) {
        var _this2 = this;
        var types = this.config.types.map(function (t) { return t.name; });
        types.forEach(function (name) {
          var cfg = _this2.config.types.find(function (t) { return t.name === name; });
          _this2.collections[name] = new FileCollection(name, cfg.layout, _this2.config);
        });
        var loaded = 0;
        var total = types.length;
        if (total === 0) return callback();
        types.forEach(function (type) {
          _this2.collections[type].init(function () {
            var coll = _this2.collections[type];
            if (type.startsWith('post')) coll.files.reverse();
            coll.resetSearch();
            loaded++;
            if (loaded >= total) callback();
          });
        });
      }
    }, {
      key: "route",
      value: function () {
        var paths = getPathsWithoutParameters();
        var type = paths[0];
        var filename = paths[1];
        var coll = this.collections[type];
        var query = getParameterByName('query') || '';
        var tag = getParameterByName('tag') || '';
        this.state = window.location.hash.slice(1);
        if (!type) {
          window.location.hash = '#/' + this.config.defaultView;
          return;
        }
        if (!coll) {
          handleMessage(this.config.debug, messages.ROUTE_404);
          renderLayout(this.config.errorLayout, this.config, {});
        } else if (filename) {
          var link = '#/' + [type, filename.trim()].join('/');
          var file = coll.getFileByPermalink(link);
          if (file) file.render();
          else renderLayout(this.config.errorLayout, this.config, {});
        } else {
          coll.resetSearch();
          if (query) coll.search('title', query);
          else if (tag) coll.getByTag(tag);
          coll.render();
        }
        this.config.onroute();
      }
    }, {
      key: "registerPlugins",
      value: function () {
        var _this3 = this;
        this.config.plugins.forEach(function (fn) {
          var name = getFunctionName(fn);
          if (name && !_this3[name]) _this3[name] = fn.bind(_this3);
        });
      }
    }, {
      key: "sort",
      value: function (type, sortFn) {
        if (!this.ready) return handleMessage(this.config.debug, messages.NOT_READY_WARNING);
        var coll = this.collections[type];
        coll[type].sort(sortFn);
        coll.render();
      }
    }, {
      key: "search",
      value: function (type, attr, keyword) {
        if (!this.ready) return handleMessage(this.config.debug, messages.NOT_READY_WARNING);
        var coll = this.collections[type];
        coll.search(attr, keyword);
        coll.render();
      }
    }]);
    return CMS;
  }();

  var main = function (options) {
    return new CMS(window, options);
  };
  return main;
}());
const exists = require('exists')

const html = require('./html')
const Window = require('./window')
const WindowOptions = require('./window-options')
const Edges = require('./edges')

/**
 * Creates a windowing system to create and manage windows
 *
 * @extends EventEmitter
 * @example
 * var wm = new WindowManager();
 *
 * wm.createWindow({ x: 20, y: 20, width: 200 });
 * wm.content.innerHTML = 'Hello there!';
 */
class WindowManager
{
    /**
     * @param {Window~WindowOptions} [defaultOptions] default WindowOptions used when createWindow is called
     * @param {boolean} [defaultOptions.quiet] suppress the simple-window-manager console message
     * @param {object} [defaultOptions.edges] turn on edge snapping
     * @param {boolean} [defaultOptions.edges.screen] snap to edge of screen
     * @param {boolean} [defaultOptions.edges.windows] snap to windows
     */
    constructor(defaultOptions)
    {
        this._createDom()
        this.windows = []
        this.active = null
        this.modal = null
        this.options = {}
        for (let key in WindowOptions)
        {
            this.options[key] = WindowOptions[key]
        }
        if (defaultOptions)
        {
            for (let key in defaultOptions)
            {
                this.options[key] = defaultOptions[key]
            }
        }
        if (!defaultOptions || !defaultOptions.quiet)
        {
            console.log('%c ☕ simple-window-manager initialized ☕', 'color: #ff00ff')
        }
        this.plugins = []
        if (defaultOptions && defaultOptions['edges'])
        {
            this.edges(defaultOptions['edges'])
        }
    }

    /**
     * Create a window
     * @param {Window~WindowOptions} [options]
     * @param {string} [options.title]
     * @param {number} [options.x] position
     * @param {number} [options.y] position
     * @param {boolean} [options.modal]
     * @param {Window} [options.center] center in the middle of an existing Window
     * @param {string|number} [options.id] if not provide, id will be assigned in order of creation (0, 1, 2...)
     * @returns {Window} the created window
     */
    createWindow(options)
    {
        options = options || {}
        for (let key in this.options)
        {
            if (!exists(options[key]))
            {
                options[key] = this.options[key]
            }
        }
        const win = new Window(this, options);
        win.on('open', this._open, this)
        win.on('focus', this._focus, this)
        win.on('blur', this._blur, this)
        win.on('close', this._close, this)
        win.win.addEventListener('mousemove', (e) => this._move(e))
        win.win.addEventListener('touchmove', (e) => this._move(e))
        win.win.addEventListener('mouseup', (e) => this._up(e))
        win.win.addEventListener('touchend', (e) => this._up(e))
        if (options.center)
        {
            win.move(
                options.center.x + options.center.width / 2 - (options.width ? options.width / 2 : 0),
                options.center.y + options.center.height / 2 - (options.height ? options.height / 2 : 0)
            )
        }
        if (options.modal)
        {
            this.modal = win
        }
        if (this.plugins['edges'])
        {
            this.plugins['edges'].addWindow(win)
        }
        return win
    }

    /**
     * add edge snapping plugin
     * @param {object} options
     * @param {boolean} [options.screen] snap to screen edges
     * @param {boolean} [options.windows] snap to window edges
     */
    edges(options)
    {
        this.plugins['edges'] = new Edges(this, options)
    }

    /**
     * remove plugin
     * @param {string} name of plugin
     */
    removePlugin(name)
    {
        if (this.plugins[name])
        {
            this.plugins[name].stop()
            delete this.plugins[name]
        }
    }

    /**
     * send window to front
     * @param {Window} win
     */
    sendToFront(win)
    {
        const index = this.windows.indexOf(win)
        if (index !== this.windows.length - 1)
        {
            this.windows.splice(index, 1)
            this.windows.push(win)
            this._reorder()
        }
    }

    /**
     * send window to back
     * @param {Window} win
     */
    sendToBack(win)
    {
        const index = this.windows.indexOf(win)
        if (index !== 0)
        {
            this.windows.splice(index, 1)
            this.windows.unshift(win)
            this._reorder()
        }
    }

    /**
     * save the state of all the windows
     * @returns {object} use this object in load() to restore the state of all windows
     */
    save()
    {
        const data = {}
        for (let i = 0; i < this.windows.length; i++)
        {
            const entry = this.windows[i]
            data[entry.id] = entry.save()
            data[entry.id].order = i
        }
        return data
    }

    /**
     * restores the state of all the windows
     * NOTE: this requires that the windows have the same id as when save() was called
     * @param {object} data created by save()
     */
    load(data)
    {
        for (let i = 0; i < this.windows.length; i++)
        {
            const entry = this.windows[i]
            if (data[entry.id])
            {
                entry.load(data[entry.id])
            }
        }
        // reorder windows
    }

    /**
     * reorder windows
     * @private
     * @returns {number} available z-index for top window
     */
    _reorder()
    {
        let i = 0
        for (; i < this.windows.length; i++)
        {
            this.windows[i].z = i
        }
    }

    _createDom()
    {
        this.win = html({
            parent: document.body, styles: {
                'user-select': 'none',
                'width': '100%',
                'height': '100%',
                'overflow': 'hidden',
                'z-index': -1,
                'cursor': 'default'
            }
        })
        this.overlay = html({
            parent: this.win, styles: {
                'user-select': 'none',
                'position': 'absolute',
                'top': 0,
                'left': 0,
                'width': '100%',
                'height': '100%',
                'overflow': 'hidden'
            }
        })
        this.overlay.addEventListener('mousemove', (e) => this._move(e))
        this.overlay.addEventListener('touchmove', (e) => this._move(e))
        this.overlay.addEventListener('mouseup', (e) => this._up(e))
        this.overlay.addEventListener('touchend', (e) => this._up(e))
    }

    _open(win)
    {
        const index = this.windows.indexOf(win)
        if (index === -1)
        {
            this.windows.push(win)
        }
    }

    _focus(win)
    {
        if (this.active === win)
        {
            return
        }

        if (this.active)
        {
            this.active.blur()
        }

        const index = this.windows.indexOf(win)
        if (index !== this.windows.length - 1)
        {
            this.windows.splice(index, 1)
            this.windows.push(win)
        }
        this._reorder()

        this.active = win
    }

    _blur(win)
    {
        if (this.active === win)
        {
            this.active = null
        }
    }

    _close(win)
    {
        if (this.modal === win)
        {
            this.modal = null
        }
        const index = this.windows.indexOf(win)
        if (index !== -1)
        {
            this.windows.splice(index, 1)
        }
        if (this.active === win)
        {
            this._blur(win)
        }
    }

    _move(e)
    {
        for (let key in this.windows)
        {
            this.windows[key]._move(e)
        }
    }

    _up(e)
    {
        for (let key in this.windows)
        {
            this.windows[key]._up(e)
        }
    }

    _checkModal(win)
    {
        return !this.modal || this.modal === win
    }
}

module.exports = WindowManager
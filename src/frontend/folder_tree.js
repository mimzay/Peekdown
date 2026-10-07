(function() {
  'use strict';

  var folderRoot = null;
  var currentFile = null;
  var expandedDirs = Object.create(null);
  var expandAfterFolderPick = false;
  var autoFolderRequested = false;
  var filesExpanded = false;
  var draggingSplitter = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function normalizePath(path) {
    return (path || '')
      .replace(/\\/g, '/')
      .replace(/\/+$/, '')
      .toLowerCase();
  }

  function parentPath(path) {
    var normalized = (path || '').replace(/\\/g, '/');
    var index = normalized.lastIndexOf('/');

    if (index < 0) return null;

    // Keep a Windows drive root as C:/ rather than C:
    if (index === 2 && /^[A-Za-z]:\//.test(normalized)) {
      return normalized.slice(0, 3);
    }

    return normalized.slice(0, index) || '/';
  }

  function clampFilePanelHeight(height) {
    var sidebar = byId('toc-panel');
    if (!sidebar) return height;

    var max = Math.max(110, sidebar.clientHeight - 90);
    return Math.max(110, Math.min(max, height));
  }

  function defaultFilePanelHeight() {
    var sidebar = byId('toc-panel');
    if (!sidebar) return 240;
    return clampFilePanelHeight(Math.round(sidebar.clientHeight * 0.66));
  }

  function loadSavedHeight() {
    try {
      var saved = parseInt(localStorage.getItem('peekdown-files-height'), 10);
      if (Number.isFinite(saved) && saved > 0) {
        return clampFilePanelHeight(saved);
      }
    } catch (e) {}
    return defaultFilePanelHeight();
  }

  function savePanelState() {
    try {
      localStorage.setItem('peekdown-files-expanded', filesExpanded ? '1' : '0');
    } catch (e) {}
  }

  function setFilesExpanded(expanded) {
    var panel = byId('file-panel');
    var sidebar = byId('toc-panel');
    var caret = byId('file-panel-caret');

    if (!panel || !sidebar || !caret) return;

    filesExpanded = !!expanded;
    panel.classList.toggle('expanded', filesExpanded);
    sidebar.classList.toggle('files-expanded', filesExpanded);
    caret.innerHTML = filesExpanded ? '&#9662;' : '&#9656;';

    if (filesExpanded) {
      panel.style.flexBasis = loadSavedHeight() + 'px';
    } else {
      panel.style.flexBasis = '28px';
    }

    savePanelState();
  }

  function appendTreeNodes(parent, nodes, depth) {
    (nodes || []).forEach(function(node) {
      var wrapper = document.createElement('div');
      var row = document.createElement('div');
      row.className = 'tree-row tree-' + node.kind;
      row.style.paddingLeft = (8 + depth * 12) + 'px';
      row.dataset.path = node.path || '';
      row.title = node.path || node.name || '';

      var marker = document.createElement('span');
      marker.className = node.kind === 'dir' ? 'tree-chevron' : 'tree-spacer';

      var name = document.createElement('span');
      name.className = 'tree-name';
      name.textContent = node.name || '';

      row.appendChild(marker);
      row.appendChild(name);
      wrapper.appendChild(row);

      if (node.kind === 'dir') {
        var key = normalizePath(node.path);
        var children = document.createElement('div');
        children.className = 'tree-children';

        var expanded = !!expandedDirs[key];
        marker.textContent = expanded ? '\u25be' : '\u25b8';
        children.classList.toggle('collapsed', !expanded);

        appendTreeNodes(children, node.children || [], depth + 1);

        row.addEventListener('click', function() {
          expanded = !expanded;
          expandedDirs[key] = expanded;
          marker.textContent = expanded ? '\u25be' : '\u25b8';
          children.classList.toggle('collapsed', !expanded);
        });

        wrapper.appendChild(children);
      } else {
        row.addEventListener('click', function() {
          currentFile = node.path;
          highlightActiveFile(node.path);
          sendToRust('open_file', { path: node.path });
        });
      }

      parent.appendChild(wrapper);
    });
  }

  function renderTree(data) {
    var tree = byId('file-tree');
    if (!tree) return;

    tree.innerHTML = '';

    if (!folderRoot) {
      var empty = document.createElement('div');
      empty.className = 'file-tree-empty';
      empty.textContent = 'Open a folder';
      tree.appendChild(empty);
      return;
    }

    if (!data.children || data.children.length === 0) {
      var noDocs = document.createElement('div');
      noDocs.className = 'file-tree-empty';
      noDocs.textContent = 'No Markdown files';
      tree.appendChild(noDocs);
    } else {
      appendTreeNodes(tree, data.children, 0);
    }

    if (data.truncated) {
      var note = document.createElement('div');
      note.className = 'file-tree-note';
      note.textContent = 'Tree limited to 5,000 scanned entries.';
      tree.appendChild(note);
    }

    var active = TabManager.getActiveTab();
    highlightActiveFile(active && active.path ? active.path : currentFile);
  }

  function highlightActiveFile(path) {
    currentFile = path || null;
    var target = normalizePath(path);

    document.querySelectorAll('#file-tree .tree-file').forEach(function(row) {
      row.classList.toggle(
        'active',
        !!target && normalizePath(row.dataset.path) === target
      );
    });
  }

  function onFolderOpened(data) {
    folderRoot = data.root || null;
    autoFolderRequested = !!folderRoot;

    var label = byId('file-root-label');
    if (label) {
      label.textContent = data.rootName || data.root || 'No folder';
      label.title = data.root || '';
    }

    renderTree(data);

    if (expandAfterFolderPick) {
      expandAfterFolderPick = false;
      setFilesExpanded(true);
    }
  }

  function requestFolderPicker() {
    expandAfterFolderPick = true;
    sendToRust('open_folder');
  }

  function refreshFolderTree() {
    if (!folderRoot) {
      requestFolderPicker();
      return;
    }
    sendToRust('open_folder', { path: folderRoot });
  }

  // Extend the existing Rust -> JS bridge without modifying app.js.
  var previousFromRust = window.__fromRust;
  window.__fromRust = function(event, data) {
    if (event === 'folder_opened') {
      onFolderOpened(data || {});
      return;
    }

    if (typeof previousFromRust === 'function') {
      previousFromRust(event, data);
    }

    if (event === 'file_opened' && data && data.path) {
      currentFile = data.path;
      highlightActiveFile(data.path);

      // First file opened in a window establishes the initial tree root.
      if (!folderRoot && !autoFolderRequested) {
        var parent = parentPath(data.path);
        if (parent) {
          autoFolderRequested = true;
          sendToRust('open_folder', { path: parent });
        }
      }
    }
  };

  // tabs.js calls this after every active-tab change.
  window.onActiveTabChanged = function(path) {
    highlightActiveFile(path);
  };

  document.addEventListener('DOMContentLoaded', function() {
    var header = byId('file-panel-header');
    var openFolder = byId('file-open-folder');
    var refresh = byId('file-refresh');
    var splitter = byId('sidebar-splitter');
    var panel = byId('file-panel');
    var sidebar = byId('toc-panel');

    try {
      filesExpanded = localStorage.getItem('peekdown-files-expanded') === '1';
    } catch (e) {
      filesExpanded = false;
    }
    setFilesExpanded(filesExpanded);

    header.addEventListener('click', function() {
      setFilesExpanded(!filesExpanded);
    });

    openFolder.addEventListener('click', function(event) {
      event.stopPropagation();
      requestFolderPicker();
    });

    refresh.addEventListener('click', function(event) {
      event.stopPropagation();
      refreshFolderTree();
    });

    splitter.addEventListener('mousedown', function(event) {
      if (!filesExpanded) return;
      event.preventDefault();
      draggingSplitter = true;
      splitter.classList.add('dragging');
      document.body.classList.add('sidebar-resizing');
    });

    splitter.addEventListener('dblclick', function() {
      if (!filesExpanded) return;
      var height = defaultFilePanelHeight();
      panel.style.flexBasis = height + 'px';
      try {
        localStorage.setItem('peekdown-files-height', String(height));
      } catch (e) {}
    });

    document.addEventListener('mousemove', function(event) {
      if (!draggingSplitter) return;

      var rect = sidebar.getBoundingClientRect();
      var height = clampFilePanelHeight(rect.bottom - event.clientY);
      panel.style.flexBasis = Math.round(height) + 'px';
    });

    document.addEventListener('mouseup', function() {
      if (!draggingSplitter) return;

      draggingSplitter = false;
      splitter.classList.remove('dragging');
      document.body.classList.remove('sidebar-resizing');

      var height = parseInt(panel.style.flexBasis, 10);
      if (Number.isFinite(height)) {
        try {
          localStorage.setItem('peekdown-files-height', String(height));
        } catch (e) {}
      }
    });
  });
})();
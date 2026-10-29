(() => {
  "use strict";
  const contentViews = ["curriculum", "announcements", "resources", "videos"];

  function initialize() {
    const workspaceNav = document.getElementById("adminWorkspaceNav");
    const contentNav = document.getElementById("adminContentTabs");
    if (!workspaceNav || !contentNav || workspaceNav.dataset.navigationReady === "true") return;
    workspaceNav.dataset.navigationReady = "true";

    const mainTabs = [...workspaceNav.querySelectorAll("[data-admin-view]")];
    const contentTabs = [...contentNav.querySelectorAll("[data-admin-content]")];
    const mainPanels = [...document.querySelectorAll("[data-admin-panel]")];
    const contentPanels = [...document.querySelectorAll("[data-admin-content-panel]")];
    let selectedContent = "curriculum";
    let lastHandledUrl = null;

    function resolve(hash) {
      let id;
      try { id = decodeURIComponent(String(hash || "").replace(/^#/, "")); }
      catch { return null; }
      if (!id || id === "teachers") return { view: "teachers", content: selectedContent };
      if (id === "content" || id === "curriculumAdminRoot") return { view: "content", content: "curriculum" };
      if (id.startsWith("content-") && contentViews.includes(id.slice(8))) return { view: "content", content: id.slice(8) };
      const target = document.getElementById(id);
      const contentPanel = target?.closest("[data-admin-content-panel]");
      if (contentPanel && contentViews.includes(contentPanel.dataset.adminContentPanel)) return { view: "content", content: contentPanel.dataset.adminContentPanel };
      const mainPanel = target?.closest("[data-admin-panel]");
      if (mainPanel?.dataset.adminPanel === "content") return { view: "content", content: selectedContent };
      if (mainPanel?.dataset.adminPanel === "teachers") return { view: "teachers", content: selectedContent };
      return null;
    }

    function setVisible(panel, visible) {
      if (!visible) {
        panel.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
        // Use the existing close action so its scroll lock and active record reset too.
        const submissionModal = panel.querySelector("#failedSubmissionModal:not(.hidden)");
        submissionModal?.querySelector("#failedSubmissionModalClose")?.click();
      }
      panel.hidden = !visible;
      panel.toggleAttribute("inert", !visible);
      panel.setAttribute("aria-hidden", String(!visible));
    }

    function apply(route, focusTab) {
      selectedContent = route.content;
      const focused = document.activeElement;
      const focusWillBeHidden = (route.view !== "content" && contentNav.contains(focused)) || [...mainPanels, ...contentPanels].some((panel) => {
        const visible = panel.hasAttribute("data-admin-panel")
          ? panel.dataset.adminPanel === route.view
          : panel.dataset.adminContentPanel === route.content;
        return !visible && panel.contains(focused);
      });
      mainTabs.forEach((tab) => {
        const selected = tab.dataset.adminView === route.view;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        tab.classList.toggle("is-active", selected);
      });
      contentTabs.forEach((tab) => {
        const selected = tab.dataset.adminContent === route.content;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        tab.classList.toggle("is-active", selected);
      });
      setVisible(contentNav, route.view === "content");
      mainPanels.forEach((panel) => setVisible(panel, panel.dataset.adminPanel === route.view));
      contentPanels.forEach((panel) => setVisible(panel, panel.dataset.adminContentPanel === route.content));
      const fallbackTab = route.view === "content"
        ? contentTabs.find((tab) => tab.dataset.adminContent === route.content)
        : mainTabs.find((tab) => tab.dataset.adminView === route.view);
      if (focusTab || focusWillBeHidden) (focusTab || fallbackTab)?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }

    function navigate(hash, focusTab) {
      const route = resolve(hash);
      if (!route) return;
      if (window.location.hash !== hash) {
        const destination = new URL(window.location.href);
        destination.hash = hash;
        window.history.pushState(window.history.state, "", destination);
      }
      lastHandledUrl = window.location.href;
      apply(route, focusTab);
    }

    function syncFromLocation() {
      if (lastHandledUrl === window.location.href) return;
      lastHandledUrl = window.location.href;
      apply(resolve(window.location.hash) || { view: "teachers", content: selectedContent });
    }

    function tabRoute(tab) {
      return tab.hasAttribute("data-admin-view")
        ? (tab.dataset.adminView === "teachers" ? "#teachers" : `#content-${selectedContent}`)
        : `#content-${tab.dataset.adminContent}`;
    }

    function bindTabs(tablist, tabs) {
      tablist.addEventListener("click", (event) => {
        const tab = event.target.closest("[data-admin-view], [data-admin-content]");
        if (!tabs.includes(tab) || tab.disabled) return;
        event.preventDefault();
        navigate(tabRoute(tab), tab);
      });
      tablist.addEventListener("keydown", (event) => {
        const tab = event.target.closest("[data-admin-view], [data-admin-content]");
        const available = tabs.filter((item) => !item.disabled);
        const index = available.indexOf(tab);
        if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? available.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + available.length) % available.length;
        const next = available[nextIndex];
        navigate(tabRoute(next), next);
      });
    }

    bindTabs(workspaceNav, mainTabs);
    bindTabs(contentNav, contentTabs);
    document.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest("a[href]");
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      let destination;
      try { destination = new URL(anchor.href, window.location.href); } catch { return; }
      if (destination.origin !== window.location.origin || destination.pathname !== window.location.pathname || destination.search !== window.location.search || !destination.hash || !resolve(destination.hash)) return;
      event.preventDefault();
      navigate(destination.hash);
    });
    window.addEventListener("popstate", syncFromLocation);
    window.addEventListener("hashchange", syncFromLocation);
    syncFromLocation();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();

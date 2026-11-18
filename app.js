(() => {
  const STORAGE_KEY = "va-words-v1";
  const API_BASE_URL = window.VA_WORDS_CONFIG?.apiBaseUrl?.replace(/\/$/, "") || "";
  const reviewIntervals = { again: 1, remembered: [1, 3, 7, 14, 30, 60, 120] };
  const state = loadState();
  const views = {
    review: document.querySelector("#review-view"),
    add: document.querySelector("#add-view"),
    library: document.querySelector("#library-view"),
  };

  document.querySelector("#library-button").addEventListener("click", () => toggleView("library"));
  document.querySelector("#add-button").addEventListener("click", () => toggleView("add"));

  document.body.classList.add("is-reviewing");
  render();

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Array.isArray(saved?.words)) {
        return {
          words: saved.words.map((word) => ({
            ...word,
            cue: word.id === "seed-tentative"
              ? createCloze(word.word, word.example)
              : word.cue || createCloze(word.word, word.example),
          })),
          draft: null,
        };
      }
    } catch {
      // A first visit should feel like a real vocabulary app, not an empty database.
    }
    return { words: [seedWord()], draft: null };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ words: state.words }));
  }

  function showView(viewName) {
    Object.entries(views).forEach(([name, element]) => element.classList.toggle("active", name === viewName));
    document.body.classList.toggle("is-reviewing", viewName === "review");
    document.querySelector("#add-button").classList.toggle("active", viewName === "add");
    document.querySelector("#library-button").classList.toggle("active", viewName === "library");
    if (viewName === "add") window.setTimeout(() => document.querySelector("#word-input")?.focus(), 50);
    render();
  }

  function toggleView(viewName) {
    const isOpen = views[viewName].classList.contains("active");
    showView(isOpen ? "review" : viewName);
  }

  function render() {
    renderReview();
    renderAdd();
    renderLibrary();
  }

  function dueWords() {
    const now = Date.now();
    return state.words.filter((word) => word.nextReviewAt <= now).sort((a, b) => a.nextReviewAt - b.nextReviewAt);
  }

  function renderReview() {
    const due = dueWords();
    if (!due.length) {
      views.review.innerHTML = document.querySelector("#empty-review-template").innerHTML;
      return;
    }
    const word = due[0];
    views.review.innerHTML = `
      <article class="review-card">
        <div class="card-face">
          <div class="card-front">
            <div class="prompt-stack">
              <p class="prompt-definition">${escapeHtml(word.definition)}</p>
              ${word.cue ? `<p class="cloze-prompt">${escapeHtml(word.cue)}</p>` : ""}
            </div>
          </div>
          <div class="card-back" hidden>
            <h2 class="word">${escapeHtml(word.word)}</h2>
            <p class="word-meta">${escapeHtml([word.partOfSpeech, word.phonetic].filter(Boolean).join(" · "))}</p>
            <p class="definition">${escapeHtml(word.definition)}</p>
            ${word.example ? `<p class="example">${escapeHtml(word.example)}</p>` : ""}
          </div>
        </div>
        <div class="ratings" hidden>
          <button class="rating-button again" data-rating="again" aria-label="Review again tomorrow"><i data-lucide="rotate-ccw"></i></button>
          <button class="rating-button remembered" data-rating="remembered" aria-label="Remembered"><i data-lucide="check"></i></button>
        </div>
        <button class="reveal-button" id="reveal-button" aria-label="Reveal word"><i data-lucide="chevron-down"></i></button>
      </article>`;

    document.querySelector("#reveal-button").addEventListener("click", () => {
      document.querySelector(".card-front").hidden = true;
      document.querySelector(".card-back").hidden = false;
      document.querySelector(".ratings").hidden = false;
      document.querySelector("#reveal-button").hidden = true;
    });
    document.querySelectorAll("[data-rating]").forEach((button) => {
      button.addEventListener("click", () => rateWord(word.id, button.dataset.rating));
    });
  }

  function renderAdd() {
    const draft = state.draft;
    views.add.innerHTML = `
      <form class="add-form" id="add-form">
        <label class="field-label" for="word-input">Word</label>
        <input class="word-input" id="word-input" name="word" autocomplete="off" autocapitalize="none" placeholder="e.g. tentative" required />
        <button class="primary-button" type="submit">Look up word</button>
        <p class="status" id="lookup-status"></p>
      </form>
      ${draft ? renderDraft(draft) : ""}`;

    views.add.querySelector("#add-form").addEventListener("submit", lookupWord);
    views.add.querySelector("#save-word")?.addEventListener("click", saveDraft);
    views.add.querySelector("#discard-word")?.addEventListener("click", () => { state.draft = null; renderAdd(); });
  }

  function renderDraft(draft) {
    return `<article class="lookup-result">
      <h2>${escapeHtml(draft.word)}</h2>
      <p class="word-meta">${escapeHtml([draft.partOfSpeech, draft.phonetic].filter(Boolean).join(" · "))}</p>
      <p class="definition">${escapeHtml(draft.definition)}</p>
      ${draft.example ? `<p class="example">${escapeHtml(draft.example)}</p>` : ""}
      <div class="result-actions">
        <button class="text-button" id="discard-word" type="button">Discard</button>
        <button class="primary-button" id="save-word" type="button">Save word</button>
      </div>
    </article>`;
  }

  async function lookupWord(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const word = new FormData(form).get("word").trim();
    const status = document.querySelector("#lookup-status");
    const button = form.querySelector("button");
    if (!word) return;
    if (!API_BASE_URL) {
      status.textContent = "The dictionary connection has not been set up yet.";
      status.className = "status error";
      return;
    }
    button.disabled = true;
    status.textContent = "Looking up word...";
    status.className = "status";
    try {
      const response = await fetch(`${API_BASE_URL}/v4/lookup?word=${encodeURIComponent(word)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The word could not be found.");
      state.draft = { ...data, cue: createCloze(data.word, data.example, data.forms) };
      renderAdd();
    } catch (error) {
      status.textContent = error.message || "Could not look up this word.";
      status.className = "status error";
    } finally {
      button.disabled = false;
    }
  }

  function saveDraft() {
    const duplicate = state.words.some((word) => word.word.toLowerCase() === state.draft.word.toLowerCase());
    if (!duplicate) {
      state.words.unshift({
        ...state.draft,
        cue: state.draft.cue || "",
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        nextReviewAt: Date.now(),
        reviewLevel: 0,
      });
      saveState();
    }
    state.draft = null;
    showView("review");
  }

  function rateWord(id, rating) {
    const word = state.words.find((item) => item.id === id);
    if (!word) return;
    if (rating === "again") {
      word.reviewLevel = 0;
      word.nextReviewAt = Date.now() + reviewIntervals.again * 24 * 60 * 60 * 1000;
    } else {
      word.reviewLevel = Math.min(word.reviewLevel + 1, reviewIntervals.remembered.length - 1);
      const days = reviewIntervals.remembered[word.reviewLevel];
      word.nextReviewAt = Date.now() + days * 24 * 60 * 60 * 1000;
    }
    saveState();
    renderReview();
  }

  function createCloze(word, example, forms = []) {
    if (!word || !example) return "";
    const candidates = [...new Set([word, ...forms]
      .map((form) => String(form || "").replace(/\*/g, "").trim())
      .filter((form) => /^[a-z][a-z' -]*$/i.test(form)))]
      .sort((first, second) => second.length - first.length);
    if (!candidates.length) return "";
    const alternatives = candidates.map((form) => form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const wordPattern = new RegExp(`\\b(?:${alternatives})\\b`, "i");
    return wordPattern.test(example) ? example.replace(wordPattern, "___") : "";
  }

  function renderLibrary() {
    const words = [...state.words].sort((a, b) => a.word.localeCompare(b.word));
    views.library.innerHTML = `
      <div class="library-heading"><h2>Words</h2><p>${words.length} saved</p></div>
      <div class="library-list">${words.length ? words.map((word) => `
        <div class="library-item" data-word-id="${escapeHtml(word.id)}">
          <div class="library-delete-action">
            <button class="library-delete-button" type="button" aria-label="Delete ${escapeHtml(word.word)}"><i data-lucide="trash-2"></i></button>
          </div>
          <article class="library-row"><h2>${escapeHtml(word.word)}</h2><p>${escapeHtml(word.definition)}</p></article>
        </div>`).join("") : "<div class=\"empty-state\"><h2>Your word list is empty.</h2><p>Add a word when one feels worth keeping.</p></div>"}</div>`;

    views.library.querySelectorAll(".library-item").forEach(enableLibrarySwipe);
  }

  function enableLibrarySwipe(item) {
    let startX = 0;
    let currentX = 0;

    item.addEventListener("touchstart", (event) => {
      startX = event.changedTouches[0].clientX;
      currentX = startX;
    }, { passive: true });

    item.addEventListener("touchmove", (event) => {
      currentX = event.changedTouches[0].clientX;
    }, { passive: true });

    item.addEventListener("touchend", () => {
      const distance = currentX - startX;
      if (distance < -44) item.classList.add("delete-revealed");
      if (distance > 28) item.classList.remove("delete-revealed");
    }, { passive: true });

    item.querySelector(".library-delete-button").addEventListener("click", () => {
      state.words = state.words.filter((word) => word.id !== item.dataset.wordId);
      saveState();
      render();
    });
  }

  function seedWord() {
    return {
      id: "seed-tentative",
      word: "tentative",
      partOfSpeech: "adjective",
      phonetic: "/ˈten.tə.t̬ɪv/",
      definition: "not fully decided or certain",
      example: "We have a tentative plan for the first release.",
      cue: "We have a ___ plan for the first release.",
      createdAt: Date.now(),
      nextReviewAt: Date.now(),
      reviewLevel: 0,
    };
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function refreshIcons() {
    window.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } });
  }

  const originalRender = render;
  render = function renderWithIcons() {
    originalRender();
    refreshIcons();
  };
  refreshIcons();
})();

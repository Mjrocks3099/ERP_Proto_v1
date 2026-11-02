(() => {
	const markUiReady = () => document.body?.classList.add("cephlon-ui-ready");
	const markUiLoading = () => document.body?.classList.remove("cephlon-ui-ready");

	markUiLoading();

	const isDeskRoute = () => {
		const path = window.location.pathname;
		return path.startsWith("/desk") || path.startsWith("/app");
	};

	const isBannerRoute = () => {
		const path = window.location.pathname.replace(/\/$/, "");
		return path === "/desk/setup/home" || path === "/desk/accounts/accounting" || (
			/^\/desk\/[^/]+$/.test(path) && path !== "/desk/setup"
		);
	};

	const replaceVisibleErpnextText = (main) => {
		const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
		const textNodes = [];
		let current;

		while ((current = walker.nextNode())) textNodes.push(current);

		textNodes.forEach((node) => {
			if (node.nodeValue.includes("ERPNext")) {
				node.nodeValue = node.nodeValue.replaceAll("ERPNext", "Cephlon ERP");
			}
		});
	};

	const hideErpnextTutorials = (main) => {
		const markers = [
			"Get to know ERPNext",
			"Get your books ready",
			"Make your first sale",
			"Order from your suppliers",
			"Keep track of your stock",
			"Plan and run production",
			"Plan and deliver projects",
			"Manage your projects",
		];
		const textNodes = [...main.querySelectorAll("h1, h2, h3, h4, p, span")];

		textNodes.forEach((node) => {
			if (!markers.some((marker) => node.textContent.trim().includes(marker))) return;

			let tutorialBlock = node;
			while (tutorialBlock && tutorialBlock !== main) {
				if ([...tutorialBlock.querySelectorAll("video, iframe, img")].length) break;
				tutorialBlock = tutorialBlock.parentElement;
			}

			if (!tutorialBlock || tutorialBlock === main) return;

			[...tutorialBlock.querySelectorAll("video, iframe, img")].forEach((media) => {
				let mediaPanel = media;
				let parent = media.parentElement;

				while (parent && parent !== tutorialBlock) {
					const rect = parent.getBoundingClientRect();
					const text = parent.textContent.trim();
					if (rect.width >= 180 && rect.height >= 100 && text.length < 180) mediaPanel = parent;
					parent = parent.parentElement;
				}

				mediaPanel.classList.add("cephlon-hide-tutorial-media");
			});
		});
	};

	const watchTutorialMediaDuringMount = (main) => {
		if (main.dataset.cephlonTutorialWatch === "active") return;

		main.dataset.cephlonTutorialWatch = "active";
		const observer = new MutationObserver(() => hideErpnextTutorials(main));
		observer.observe(main, { childList: true, subtree: true });

		window.setTimeout(() => {
			observer.disconnect();
			delete main.dataset.cephlonTutorialWatch;
		}, 4000);
	};

	const replaceFrappeBranding = () => {
		document.querySelectorAll(
			"[data-app-name='frappe'], [data-app='frappe'], [data-app-name='framework']"
		).forEach((element) => {
			(element.closest("a, button, .app-item, .app-card") || element).classList.add("cephlon-hide-erpnext-brand");
		});

		document.querySelectorAll(".navbar-home img, .navbar-home .app-logo").forEach((logo) => {
			logo.src = "/assets/erpnext/images/cephlon-logo.png";
			logo.alt = "Cephlon ERP";
		});
	};

	const markCephlonRail = () => {
		const rail = [...document.querySelectorAll("body *")]
			.filter((element) => {
				const rect = element.getBoundingClientRect();
				return rect.left <= 2 && rect.width >= 50 && rect.width <= 90 &&
					rect.height >= window.innerHeight * 0.7 &&
					element.querySelectorAll("a, button, svg").length >= 5;
			})
			.sort((first, second) => first.getBoundingClientRect().width - second.getBoundingClientRect().width)[0];

		if (rail) rail.classList.add("cephlon-rail");
	};

	const renderCephlonHome = () => {
		if (!isDeskRoute()) {
			markUiReady();
			return;
		}

		const main = document.querySelector(".layout-main-section");
		if (!main) {
			/* /desk is the app launcher and has no workspace main section. */
			markUiReady();
			return;
		}

		replaceFrappeBranding();
		markCephlonRail();
		replaceVisibleErpnextText(main);
		hideErpnextTutorials(main);
		watchTutorialMediaDuringMount(main);
		if (!isBannerRoute()) {
			main.querySelector(".cephlon-home-banner")?.remove();
			return;
		}

		if (!main.querySelector(".cephlon-home-banner")) {
			const banner = document.createElement("section");
			banner.className = "cephlon-home-banner";
			banner.setAttribute("aria-label", "Cephlon ERP quick actions");
			banner.innerHTML = `
			<div class="cephlon-home-banner__content">
				<img class="cephlon-home-logo" src="/assets/erpnext/images/cephlon-logo.png" alt="Cephlon ERP">
				<p class="cephlon-home-banner__eyebrow">Cephlon ERP</p>
				<h2>Your business, in one workspace.</h2>
				<p>Manage customers, sales, purchasing, inventory, accounts, and operations from one connected ERP workspace.</p>
			</div>
			<nav class="cephlon-home-banner__actions" aria-label="Quick actions">
				<a class="cephlon-home-action cephlon-home-action--primary" href="/app/customer/new">New customer</a>
				<a class="cephlon-home-action" href="/app/sales-invoice/new">New invoice</a>
				<a class="cephlon-home-action" href="/app/sales-order/new">New order</a>
			</nav>`;

			main.prepend(banner);
		}

		markUiReady();
	};

	let renderFrame;
	let retryCount = 0;

	const scheduleRender = () => {
		window.cancelAnimationFrame(renderFrame);
		renderFrame = window.requestAnimationFrame(() => {
			const before = document.querySelector(".layout-main-section");
			renderCephlonHome();

			/* Frappe mounts tutorial media after the workspace text. Retry a few
			   times while the route settles so only the late video panel is removed;
			   never run a live observer. */
			if ((!before || retryCount < 4) && retryCount < 5) {
				retryCount += 1;
				window.setTimeout(scheduleRender, 100);
			} else {
				retryCount = 0;
			}
		});
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", scheduleRender, { once: true });
	} else {
		scheduleRender();
	}

	if (window.frappe?.router?.on) {
		frappe.router.on("change", () => {
			retryCount = 0;
			markUiLoading();
			scheduleRender();
		});
	}
})();

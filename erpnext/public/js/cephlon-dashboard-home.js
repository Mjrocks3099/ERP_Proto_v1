(() => {
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

	const renderCephlonHome = () => {
		if (!isDeskRoute()) return;

		const main = document.querySelector(".layout-main-section");
		if (!main) return;

		replaceFrappeBranding();
		replaceVisibleErpnextText(main);
		hideErpnextTutorials(main);
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
	};

	const scheduleRender = () => window.setTimeout(renderCephlonHome, 250);

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", scheduleRender, { once: true });
	} else {
		scheduleRender();
	}

	if (window.frappe?.router?.on) {
		frappe.router.on("change", scheduleRender);
	}
})();

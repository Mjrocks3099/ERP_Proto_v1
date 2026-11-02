(() => {
	const updateCephlonLogin = () => {
		if (window.location.pathname !== "/login") return;

		const page = document.querySelector("#page-login");
		const wrapper = page?.querySelector(".page-content-wrapper");
		if (wrapper && !wrapper.querySelector(".cephlon-brand-panel")) {
			const brand = document.createElement("aside");
			brand.className = "cephlon-brand-panel";
		brand.innerHTML = `
			<img class="cephlon-brand-logo" src="/assets/erpnext/images/cephlon-logo.png" alt="Cephlon ERP">
				<div class="cephlon-brand-copy">
					<h1>Cephlon <span>ERP</span></h1>
				<p>Business management, accounting and operations.<br>Everything your business needs in one place.</p>
				</div>
				<div class="cephlon-brand-footer">
					<strong>Built different. On purpose.</strong>
					<span>Confidential by design.</span>
				</div>`;
			wrapper.insertBefore(brand, wrapper.firstChild);
		}

		const subtitle = document.querySelector(".for-login .page-card-subtitle");
		if (subtitle && subtitle.textContent !== "Use your Cephlon ERP account") subtitle.textContent = "Use your Cephlon ERP account";

		const heading = document.querySelector(".for-login .page-card-head h4");
		if (heading && heading.textContent !== "Sign in") heading.textContent = "Sign in";

		const emailLabel = document.querySelector("label[for='login_email']");
		if (emailLabel && emailLabel.textContent !== "Account name or email") emailLabel.textContent = "Account name or email";

		const emailInput = document.querySelector("#login_email");
		if (emailInput) emailInput.placeholder = "you@cephlon.com";

		const loginButton = document.querySelector(".for-login .form-login button[type='submit']");
		if (loginButton && loginButton.textContent !== "Log in") loginButton.textContent = "Log in";

		const poweredBy = document.querySelector(".footer-powered");
		if (poweredBy && poweredBy.textContent !== "Internal · authorized use only") poweredBy.textContent = "Internal · authorized use only";

		const form = document.querySelector(".for-login .form-login");
		if (form && !form.querySelector(".cephlon-remember")) {
			const remember = document.createElement("label");
			remember.className = "cephlon-remember";
			remember.innerHTML = '<input type="checkbox" checked> <span>Remember me</span>';
			const actions = form.querySelector(".page-card-actions");
			if (actions) actions.parentNode.insertBefore(remember, actions);
		}

		if (form && !form.querySelector(".cephlon-login-footer")) {
			const footer = document.createElement("div");
			footer.className = "cephlon-login-footer";
			footer.textContent = "Internal · authorized use only";
			form.appendChild(footer);
		}
	};

	updateCephlonLogin();
})();

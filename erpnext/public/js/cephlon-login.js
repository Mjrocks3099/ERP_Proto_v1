const removeCephlonLoginSubtitle = () => {
	if (window.location.pathname !== "/login") return;

	document.querySelectorAll("#page-login .page-card-subtitle").forEach((subtitle) => {
		subtitle.remove();
	});
};

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", removeCephlonLoginSubtitle);
} else {
	removeCephlonLoginSubtitle();
}

setTimeout(removeCephlonLoginSubtitle, 0);
setTimeout(removeCephlonLoginSubtitle, 500);

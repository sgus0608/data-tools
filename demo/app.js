(() => {
  const key = "moru-demo-member";
  let status = localStorage.getItem(key) || "guest";

  const form = document.querySelector(".application-form");
  const nav = document.querySelector(".nav");
  const menuButton = document.querySelector(".menu-button");
  const adminButton = document.querySelector(".text-button");
  const headerCta = document.querySelector(".header-cta");
  const statusChip = document.querySelector(".application-form .status-chip");
  const price = document.querySelector(".price-block strong");
  const priceNote = document.querySelector(".price-block small");
  const purchaseButton = document.querySelector(".purchase-button");

  const setNotice = (message) => {
    let notice = form.querySelector(".form-notice");
    if (!notice) {
      notice = document.createElement("p");
      notice.className = "form-notice";
      notice.setAttribute("role", "status");
      form.appendChild(notice);
    }
    notice.textContent = message;
  };

  const render = () => {
    statusChip.className = `status-chip ${status}`;
    statusChip.textContent =
      status === "approved" ? "승인 완료" : status === "pending" ? "확인 중" : "신규 신청";
    headerCta.textContent =
      status === "approved" ? "승인회원" : status === "pending" ? "승인 대기" : "PARTNER JOIN";
    price.textContent = status === "approved" ? "₩ 216,000" : "승인 회원에게 공개";
    priceNote.textContent =
      status === "approved"
        ? "VAT 포함 · 12개 기준"
        : "사업자 승인 후 가격을 확인할 수 있습니다.";
    purchaseButton.innerHTML =
      status === "approved" ? "구매하기 <span>→</span>" : "승인 후 구매 가능 <span>→</span>";
  };

  const setStatus = (next) => {
    status = next;
    localStorage.setItem(key, next);
    render();
  };

  const closeModal = () => document.querySelector(".modal-backdrop")?.remove();

  const openAdmin = () => {
    closeModal();
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="modal-backdrop">
        <section class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-title">
          <button class="modal-close" aria-label="닫기">×</button>
          <p class="section-label">DEMO ADMIN</p>
          <h2 id="admin-title">사업자 승인 관리</h2>
          <div class="admin-card">
            <div><span class="avatar">M</span><p><strong>주식회사 모루스테이</strong><small>123-45-67890 · hello@company.co.kr</small></p></div>
            <span class="status-chip ${status}">${status === "approved" ? "승인 완료" : status === "pending" ? "승인 대기" : "신청 전"}</span>
          </div>
          <p class="admin-help">실제 운영 버전에서는 관리자 로그인 후 등록증과 사업자 상태를 확인하여 승인합니다.</p>
          <div class="admin-actions">
            <button class="reset-demo">데모 초기화</button>
            <button class="approve" ${status === "guest" ? "disabled" : ""}>사업자 승인</button>
          </div>
        </section>
      </div>`,
    );
    const backdrop = document.querySelector(".modal-backdrop");
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeModal();
    });
    backdrop.querySelector(".modal-close").addEventListener("click", closeModal);
    backdrop.querySelector(".reset-demo").addEventListener("click", () => {
      setStatus("guest");
      form.querySelector(".form-notice")?.remove();
      closeModal();
    });
    backdrop.querySelector(".approve").addEventListener("click", () => {
      setStatus("approved");
      setNotice("사업자 승인이 완료되었습니다. 이제 전용 상품을 구매할 수 있습니다.");
      closeModal();
    });
  };

  const openCheckout = () => {
    closeModal();
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="modal-backdrop">
        <section class="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
          <button class="modal-close" aria-label="닫기">×</button>
          <p class="section-label">DEMO CHECKOUT</p>
          <h2 id="checkout-title">주문을 확인해 주세요.</h2>
          <div class="order-line">
            <div class="order-thumb">M</div>
            <div><strong>Daily Hand Wash · 12개</strong><small>500 ml / 1 BOX</small></div>
            <strong>₩216,000</strong>
          </div>
          <dl class="order-total">
            <div><dt>상품 금액</dt><dd>₩216,000</dd></div>
            <div><dt>배송비</dt><dd>무료</dd></div>
            <div><dt>총 결제금액</dt><dd>₩216,000</dd></div>
          </dl>
          <button class="npay-button"><b>N</b> pay로 결제하기</button>
          <p class="checkout-note">현재는 모의 결제입니다. 실제 결제나 주문은 발생하지 않습니다.</p>
        </section>
      </div>`,
    );
    const backdrop = document.querySelector(".modal-backdrop");
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeModal();
    });
    backdrop.querySelector(".modal-close").addEventListener("click", closeModal);
    backdrop.querySelector(".npay-button").addEventListener("click", () => {
      alert("현재는 시연용입니다. 네이버페이 가맹점 승인 후 실제 결제창으로 연결됩니다.");
    });
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    setStatus("pending");
    setNotice("신청이 접수되었습니다. 관리자가 확인한 뒤 승인해 드립니다.");
    form.reset();
  });

  menuButton.addEventListener("click", () => {
    nav.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(nav.classList.contains("open")));
  });
  nav.querySelectorAll("a").forEach((link) =>
    link.addEventListener("click", () => nav.classList.remove("open")),
  );
  adminButton.addEventListener("click", openAdmin);
  purchaseButton.addEventListener("click", () => {
    if (status !== "approved") {
      setNotice(
        status === "pending"
          ? "현재 사업자 확인 중입니다. 승인 후 구매할 수 있습니다."
          : "사업자 회원가입과 승인이 필요한 상품입니다.",
      );
      document.querySelector("#membership").scrollIntoView({ behavior: "smooth" });
      return;
    }
    openCheckout();
  });

  render();
})();

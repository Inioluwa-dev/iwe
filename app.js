// Main application logic for the coursemate book tracker.

let currentPage = 1;
const itemsPerPage = 15;
let duesCurrentPage = 1;
const duesItemsPerPage = 15;
let currentSearch = "";
let currentStatusFilter = "all";

const normalize = (value) => (value || "").trim().toLowerCase();

const escapeHTML = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const getBookStatus = (book) => {
  if (book.status === "completed" || book.arranged === true) return "completed";
  if (book.status === "paid") return "paid";
  return "pending";
};

const normalizeStatus = (status) => {
  const norm = normalize(status);
  if (norm === "completed") return "completed";
  if (norm === "paid") return "paid";
  return "pending";
};

const csvEscape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

const showAlert = (message, type = "success") => {
  const alertContainer = document.getElementById("alerts");
  if (!alertContainer) return;

  const alertDiv = document.createElement("div");
  alertDiv.className = `alert alert-${type}`;
  alertDiv.setAttribute("role", "alert");
  alertDiv.textContent = message;
  alertContainer.appendChild(alertDiv);

  // Slide the toast into view
  requestAnimationFrame(() => alertDiv.classList.add("alert-show"));

  const duration = type === "error" ? 5000 : 3500;

  const hide = () => {
    alertDiv.classList.remove("alert-show");
    alertDiv.classList.add("alert-hide");
    alertDiv.addEventListener(
      "transitionend",
      () => {
        try {
          alertDiv.remove();
        } catch (e) {}
      },
      { once: true },
    );
  };

  setTimeout(hide, duration);
};

const pageMeta = {
  tracker: { title: "Home", sub: "Coursemates & book status" },
  manage: { title: "Add & Books", sub: "Add people, import lists, book prices" },
  financials: { title: "Money", sub: "Costs, sales & profit" },
  dues: { title: "Dues", sub: "Collect & track class dues" },
};

const showPage = (pageName) => {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === `${pageName}Page`);
  });

  // Sidebar (desktop) and bottom bar (mobile) share this class.
  document.querySelectorAll(".app-nav-item").forEach((item) => {
    const isActive = item.dataset.page === pageName;
    item.classList.toggle("active", isActive);
    if (isActive) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });

  const meta = pageMeta[pageName];
  if (meta) {
    const titleEl = document.getElementById("topbarTitle");
    const subEl = document.getElementById("topbarSub");
    if (titleEl) titleEl.textContent = meta.title;
    if (subEl) subEl.textContent = meta.sub;
    document.title = `${meta.title} - Coursemate Book Tracker`;
  }

  window.scrollTo(0, 0);
};

const ensureDBReady = () => {
  if (db) return true;
  showAlert(
    "Database is loading. Please wait a moment and try again.",
    "error",
  );
  return false;
};

const addCourse = async () => {
  const bookTitle = document.getElementById("courseCode").value.trim();
  const buyingPrice = Number(document.getElementById("courseBuyingPrice").value) || 0;
  const sellingPrice = Number(document.getElementById("courseSellingPrice").value) || 0;

  if (!bookTitle) {
    showAlert("Please enter a book title", "error");
    return;
  }

  try {
    if (!ensureDBReady()) return;

    const catalogBooks = await getAllCoursesFromCatalog();
    const exists = catalogBooks.some(
      (book) => normalize(book.courseCode) === normalize(bookTitle),
    );

    if (exists) {
      showAlert(`"${bookTitle}" already exists in the book list`, "error");
      return;
    }

    await addCourseToCatalog(bookTitle, sellingPrice, buyingPrice, 0);

    const students = await getAllStudents();
    for (const student of students) {
      await addCourseToDB(student.id, bookTitle);
    }

    document.getElementById("courseCode").value = "";
    document.getElementById("courseBuyingPrice").value = "0";
    document.getElementById("courseSellingPrice").value = "0";
    showAlert(`"${bookTitle}" assigned to ${students.length} coursemate(s)`);
    await refreshUI();
  } catch (error) {
    showAlert("Error adding book: " + error.message, "error");
  }
};

const refreshUI = async () => {
  if (typeof renderDuesTable === "function") renderDuesTable();
  currentPage = 1;
  await renderCourseCatalog();
  await renderStudentsTable();
  await updateStats();
  await renderFinancials();
};

const renderCourseCatalog = async () => {
  const books = await getAllCoursesFromCatalog();
  const allStudentBooks = await getAllCourses();
  const container = document.getElementById("courseCatalogContainer");

  if (books.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No shared books yet. Use the form above to add your first book.</p></div>';
    return;
  }

  const rows = books.map((book) => {
    const paidCount = allStudentBooks.filter(
      (sb) =>
        normalize(sb.courseCode) === normalize(book.courseCode) &&
        (sb.status === "paid" && sb.arranged !== true)
    ).length;

    const completedCount = allStudentBooks.filter(
      (sb) =>
        normalize(sb.courseCode) === normalize(book.courseCode) &&
        (sb.status === "completed" || sb.arranged === true)
    ).length + (book.quantityBought || 0);

    const buyingPrice = book.buyingPrice || 0;
    const sellingPrice = book.price || 0;

    return `
      <tr>
        <td data-label="Book Title"><strong>${escapeHTML(book.courseCode)}</strong></td>
        <td data-label="Buying Price">₦${buyingPrice.toFixed(2)}</td>
        <td data-label="Selling Price">₦${sellingPrice.toFixed(2)}</td>
        <td data-label="Paid">${paidCount}</td>
        <td data-label="Completed">${completedCount}</td>
        <td data-label="Actions" class="row-actions">
          <button class="icon-button" title="Edit book details" onclick="openEditBookModal(${book.id})">✎</button>
          <button class="icon-button danger" title="Remove from everyone" onclick="deleteCourseCatalogAction(${book.id})">×</button>
        </td>
      </tr>
    `;
  }).join("");

  container.innerHTML = `
    <div style="margin-top: 20px;">
      <h3>Shared Books List</h3>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Book Title</th>
              <th>Buying Price</th>
              <th>Selling Price</th>
              <th>Paid</th>
              <th>Completed</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
};

const renderStudentsTable = async () => {
  let students = await getAllStudents();
  const books = await getAllCourses();
  const container = document.getElementById("tableContainer");

  if (currentSearch.trim()) {
    const term = normalize(currentSearch);
    students = students.filter(
      (student) =>
        normalize(student.name).includes(term) ||
        normalize(student.matricNo).includes(term),
    );
  }

  if (students.length === 0) {
    if (currentSearch.trim()) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">No matches</div>
          <p>No coursemate matches "${escapeHTML(currentSearch.trim())}". Try another name or matric number.</p>
        </div>
      `;
      return;
    }
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">No coursemates yet</div>
        <p>Add your classmates first, then track their books here.</p>
        <ol class="steps">
          <li><strong>1.</strong> Go to Add & Books and add names</li>
          <li><strong>2.</strong> Add the books everyone needs</li>
          <li><strong>3.</strong> Come back here and tap ○ → ₦ → ✓</li>
        </ol>
        <div class="button-group">
          <button class="btn-primary" onclick="showPage('manage')">Add Coursemates</button>
        </div>
      </div>
    `;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(students.length / itemsPerPage));
  if (currentPage > totalPages) currentPage = totalPages;

  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedStudents = students.slice(
    startIndex,
    startIndex + itemsPerPage,
  );

  const rows = paginatedStudents
    .map((student) => {
      let studentBooks = books.filter((book) => book.studentId === student.id);

      if (currentStatusFilter !== "all") {
        studentBooks = studentBooks.filter(
          (book) => getBookStatus(book) === currentStatusFilter,
        );
      }

      const completedCount = books.filter(
        (book) =>
          book.studentId === student.id && getBookStatus(book) === "completed",
      ).length;
      const totalCount = books.filter(
        (book) => book.studentId === student.id,
      ).length;

      const booksHtml =
        studentBooks.length === 0
          ? '<em style="color: #777;">No matching books</em>'
          : `<div class="assignment-grid">${studentBooks
              .map((book) => {
                const status = getBookStatus(book);
                let nextStatus, statusIcon, statusLabel;
                if (status === "pending") {
                  nextStatus = "paid";
                  statusIcon = "○";
                  statusLabel = "Mark Paid";
                } else if (status === "paid") {
                  nextStatus = "completed";
                  statusIcon = "₦";
                  statusLabel = "Mark Completed";
                } else {
                  nextStatus = "pending";
                  statusIcon = "✓";
                  statusLabel = "Mark Pending";
                }
                return `
                  <div class="assignment-card ${status}">
                    <strong class="book-title" title="${escapeHTML(book.courseCode)}">${escapeHTML(book.courseCode)}</strong>
                    <button class="icon-button status-toggle ${status}" title="${statusLabel}" aria-label="${statusLabel}" onclick="updateCourseStatusAction(${book.id}, '${nextStatus}')">${statusIcon}</button>
                    <button class="icon-button danger" title="Remove book" aria-label="Remove book" onclick="deleteCourseAction(${book.id})">×</button>
                  </div>
                `;
              })
              .join("")}</div>`;

      return `
        <tr>
          <td data-label="Coursemate">
            <strong>${escapeHTML(student.name)}</strong>
            <div class="progress-text">${completedCount}/${totalCount} completed</div>
          </td>
          <td data-label="Matric No">${escapeHTML(student.matricNo || "-")}</td>
          <td data-label="Books">${booksHtml}</td>
          <td data-label="Actions" class="row-actions">
            <button class="icon-button primary" title="Add book" aria-label="Add book" onclick="openAddCourseModal(${student.id})">+</button>
            <button class="icon-button" title="Edit coursemate" aria-label="Edit coursemate" onclick="openEditStudentModal(${student.id})">✎</button>
            <button class="icon-button danger" title="Delete coursemate" aria-label="Delete coursemate" onclick="deleteStudentAction(${student.id})">×</button>
          </td>
        </tr>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Coursemate</th>
            <th>Matric No</th>
            <th>Books</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="pagination">
      <button class="btn-secondary btn-small" onclick="previousPage()" ${currentPage === 1 ? "disabled" : ""}>Previous</button>
      <span>Page <strong>${currentPage}</strong> of <strong>${totalPages}</strong> (${students.length} total)</span>
      <button class="btn-secondary btn-small" onclick="nextPage()" ${currentPage === totalPages ? "disabled" : ""}>Next</button>
    </div>
  `;
};

const nextPage = async () => {
  const students = await getAllStudents();
  const totalPages = Math.max(1, Math.ceil(students.length / itemsPerPage));
  if (currentPage < totalPages) {
    currentPage++;
    await renderStudentsTable();
  }
};

const previousPage = async () => {
  if (currentPage > 1) {
    currentPage--;
    await renderStudentsTable();
  }
};

const updateCourseStatusAction = async (courseId, status) => {
  try {
    if (!ensureDBReady()) return;
    await updateCourseStatus(courseId, status);
    await refreshUI();
  } catch (error) {
    showAlert("Error updating book: " + error.message, "error");
  }
};

const deleteCourseAction = async (courseId) => {
  if (!confirm("Remove this book from this coursemate?")) return;

  try {
    await deleteCourse(courseId);
    showAlert("Book removed from coursemate");
    await refreshUI();
  } catch (error) {
    showAlert("Error removing book: " + error.message, "error");
  }
};

const deleteCourseCatalogAction = async (courseCatalogId) => {
  if (!confirm("Remove this shared book from everyone?")) return;

  try {
    await deleteCourseCatalog(courseCatalogId);
    showAlert("Shared book removed from everyone");
    await refreshUI();
  } catch (error) {
    showAlert("Error deleting book: " + error.message, "error");
  }
};

const deleteStudentAction = async (studentId) => {
  if (!confirm("Delete this coursemate and all their book assignments?"))
    return;

  try {
    await deleteStudent(studentId);
    showAlert("Coursemate deleted");
    await refreshUI();
  } catch (error) {
    showAlert("Error deleting coursemate: " + error.message, "error");
  }
};

const renderFinancials = async () => {
  const catalogBooks = await getAllCoursesFromCatalog();
  const allStudentBooks = await getAllCourses();
  const container = document.getElementById("financialsTableContainer");

  let totalCostAll = 0;
  let totalRevenueAll = 0;
  let totalProfitAll = 0;

  const rows = catalogBooks.map((book) => {
    const paidCount = allStudentBooks.filter(
      (sb) =>
        normalize(sb.courseCode) === normalize(book.courseCode) &&
        (sb.status === "paid" && sb.arranged !== true)
    ).length;

    const completedCount = allStudentBooks.filter(
      (sb) =>
        normalize(sb.courseCode) === normalize(book.courseCode) &&
        (sb.status === "completed" || sb.arranged === true)
    ).length + (book.quantityBought || 0);

    const soldCount = paidCount + completedCount;

    const buyingPrice = book.buyingPrice || 0;
    const sellingPrice = book.price || 0;

    const totalCost = soldCount * buyingPrice;
    const totalRevenue = soldCount * sellingPrice;
    const profit = totalRevenue - totalCost;

    totalCostAll += totalCost;
    totalRevenueAll += totalRevenue;
    totalProfitAll += profit;

    return `
      <tr>
        <td data-label="Book Title"><strong>${escapeHTML(book.courseCode)}</strong></td>
        <td data-label="Paid">${paidCount}</td>
        <td data-label="Completed">${completedCount}</td>
        <td data-label="Buying Price">₦${buyingPrice.toFixed(2)}</td>
        <td data-label="Selling Price">₦${sellingPrice.toFixed(2)}</td>
        <td data-label="Total Cost">₦${totalCost.toFixed(2)}</td>
        <td data-label="Total Revenue">₦${totalRevenue.toFixed(2)}</td>
        <td data-label="Total Profit" class="${profit >= 0 ? 'text-success' : 'text-danger'}">
          ₦${profit.toFixed(2)}
        </td>
      </tr>
    `;
  }).join("");

  document.getElementById("financialTotalCost").textContent = `₦${totalCostAll.toFixed(2)}`;
  document.getElementById("financialTotalRevenue").textContent = `₦${totalRevenueAll.toFixed(2)}`;
  
  const profitEl = document.getElementById("financialTotalProfit");
  profitEl.textContent = `₦${totalProfitAll.toFixed(2)}`;

  const profitCard = document.getElementById("profitStatCard");
  if (profitCard) {
    if (totalProfitAll >= 0) {
      profitCard.classList.remove("negative");
      profitCard.classList.add("positive");
    } else {
      profitCard.classList.remove("positive");
      profitCard.classList.add("negative");
    }
  }

  if (catalogBooks.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">No money records yet</div>
      <p>Add a shared book first — profit appears here once books are marked Paid or Completed.</p>
      <div class="button-group"><button class="btn-primary" onclick="showPage('manage')">Add a Book</button></div>
    </div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Book Title</th>
            <th>Paid</th>
            <th>Completed</th>
            <th>Buying Price</th>
            <th>Selling Price</th>
            <th>Total Cost</th>
            <th>Total Revenue</th>
            <th>Total Profit</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr style="font-weight: bold; background: var(--teal-50); border-top: 2px solid var(--line);">
            <td data-label="Book Title">Total</td>
            <td data-label="Paid">-</td>
            <td data-label="Completed">-</td>
            <td data-label="Buying Price">-</td>
            <td data-label="Selling Price">-</td>
            <td data-label="Total Cost">₦${totalCostAll.toFixed(2)}</td>
            <td data-label="Total Revenue">₦${totalRevenueAll.toFixed(2)}</td>
            <td data-label="Total Profit" style="color: ${totalProfitAll >= 0 ? 'var(--teal-700)' : '#be123c'}">₦${totalProfitAll.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
};

const updateStats = async () => {
  const students = await getAllStudents();
  const catalogBooks = await getAllCoursesFromCatalog();
  const allBooks = await getAllCourses();
  const uniqueBooks = new Set([
    ...catalogBooks.map((book) => normalize(book.courseCode)),
    ...allBooks.map((book) => normalize(book.courseCode)),
  ]);

  document.getElementById("totalStudents").textContent = students.length;
  document.getElementById("totalCourses").textContent = uniqueBooks.size;
};

const handleSearch = () => {
  currentSearch = document.getElementById("searchInput").value || "";
  currentPage = 1;
  renderStudentsTable();
};

const filterByStatus = (status) => {
  currentStatusFilter = status || "all";
  currentPage = 1;

  ["filterAll", "filterPending", "filterPaid", "filterCompleted"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("active-filter");
  });

  const activeId =
    status === "completed"
      ? "filterCompleted"
      : status === "paid"
        ? "filterPaid"
        : status === "pending"
          ? "filterPending"
          : "filterAll";
  document.getElementById(activeId)?.classList.add("active-filter");
  renderStudentsTable();
};

let editStudentId = null;

const openEditStudentModal = async (studentId) => {
  try {
    const student = await getStudentById(studentId);
    if (!student) {
      showAlert("Coursemate not found", "error");
      return;
    }

    editStudentId = studentId;
    document.getElementById("editStudentName").value = student.name || "";
    document.getElementById("editStudentMatric").value = student.matricNo || "";
    const excludeCb = document.getElementById("editExcludeFromDues");
    if (excludeCb) excludeCb.checked = student.excludeFromDues === true;
    document.getElementById("editStudentModal").classList.add("active");
  } catch (error) {
    showAlert("Error opening edit form: " + error.message, "error");
  }
};

const closeEditStudentModal = () => {
  editStudentId = null;
  document.getElementById("editStudentModal").classList.remove("active");
};

const saveEditStudent = async () => {
  const name = document.getElementById("editStudentName").value.trim();
  const matric = document.getElementById("editStudentMatric").value.trim();
  const excludeCb = document.getElementById("editExcludeFromDues");
  const excludeFromDues = excludeCb ? excludeCb.checked : false;

  if (!name) {
    showAlert("Please enter the coursemate's name", "error");
    return;
  }

  try {
    await updateStudent(editStudentId, name, matric, excludeFromDues);
    showAlert("Coursemate updated");
    closeEditStudentModal();
    await refreshUI();
  } catch (error) {
    showAlert("Error saving coursemate: " + error.message, "error");
  }
};

let editBookId = null;

const openEditBookModal = async (bookId) => {
  try {
    if (!ensureDBReady()) return;
    const books = await getAllCoursesFromCatalog();
    const book = books.find((b) => b.id === bookId);
    if (!book) {
      showAlert("Book not found in catalog", "error");
      return;
    }

    editBookId = bookId;
    document.getElementById("editBookTitle").value = book.courseCode || "";
    document.getElementById("editBookBuyingPrice").value = book.buyingPrice || 0;
    document.getElementById("editBookSellingPrice").value = book.price || 0;

    document.getElementById("editBookModal").classList.add("active");
  } catch (error) {
    showAlert("Error opening edit form: " + error.message, "error");
  }
};

const closeEditBookModal = () => {
  editBookId = null;
  document.getElementById("editBookModal").classList.remove("active");
};

const saveEditBook = async () => {
  const title = document.getElementById("editBookTitle").value.trim();
  const buyingPrice = Number(document.getElementById("editBookBuyingPrice").value) || 0;
  const sellingPrice = Number(document.getElementById("editBookSellingPrice").value) || 0;

  if (!title) {
    showAlert("Please enter a book title", "error");
    return;
  }

  try {
    await updateCourseCatalogDetails(editBookId, sellingPrice, buyingPrice, undefined, title);
    showAlert("Book details updated successfully");
    closeEditBookModal();
    await refreshUI();
  } catch (error) {
    showAlert("Error updating book: " + error.message, "error");
  }
};

let currentStudentId = null;

const openAddCourseModal = (studentId) => {
  currentStudentId = studentId;
  document.getElementById("specialCourseCode").value = "";
  document.getElementById("addCourseModal").classList.add("active");
};

const closeAddCourseModal = () => {
  document.getElementById("addCourseModal").classList.remove("active");
  currentStudentId = null;
};

const addSpecializedCourse = async () => {
  const bookTitle = document.getElementById("specialCourseCode").value.trim();

  if (!bookTitle) {
    showAlert("Please enter a book title", "error");
    return;
  }

  if (!currentStudentId) {
    showAlert("No coursemate selected", "error");
    return;
  }

  try {
    const existingBooks = await getCoursesByStudent(currentStudentId);
    const exists = existingBooks.some(
      (book) => normalize(book.courseCode) === normalize(bookTitle),
    );

    if (exists) {
      showAlert(
        `"${bookTitle}" is already assigned to this coursemate`,
        "error",
      );
      return;
    }

    const catalogBooks = await getAllCoursesFromCatalog();
    const existsInCatalog = catalogBooks.some(
      (b) => normalize(b.courseCode) === normalize(bookTitle),
    );
    if (!existsInCatalog) {
      await addCourseToCatalog(bookTitle, 0, 0, 0);
    }

    await addCourseToDB(currentStudentId, bookTitle);
    showAlert(`"${bookTitle}" assigned`);
    closeAddCourseModal();
    await refreshUI();
  } catch (error) {
    showAlert("Error assigning book: " + error.message, "error");
  }
};

const parseCSVLine = (line) => {
  const values = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      value += '"';
      index++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }

  values.push(value.trim());
  return values;
};

const parseCSV = (text) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index] || "";
      return row;
    }, {});
  });
};

const parseExcel = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const parse = () => {
          const data = new Uint8Array(event.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json(worksheet));
        };

        if (typeof XLSX === "undefined") {
          const script = document.createElement("script");
          script.src =
            "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.min.js";
          script.onload = parse;
          script.onerror = () =>
            reject(new Error("Could not load Excel parser"));
          document.head.appendChild(script);
        } else {
          parse();
        }
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error("Error reading file"));
    reader.readAsArrayBuffer(file);
  });
};

const importFile = async () => {
  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];

  if (!file) {
    showAlert("Please select a CSV or Excel file first", "error");
    return;
  }

  try {
    let data = [];

    const fileName = file.name.toLowerCase();

    if (fileName.endsWith(".csv") || file.type === "text/csv") {
      data = parseCSV(await file.text());
    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      data = await parseExcel(file);
    } else {
      showAlert("Please upload a CSV or Excel file", "error");
      return;
    }

    if (data.length === 0) {
      showAlert("The file appears to be empty", "error");
      return;
    }

    const columns = Object.keys(data[0]);
    const findColumn = (...terms) =>
      columns.find((column) =>
        terms.some((term) => column.toLowerCase().includes(term)),
      );

    const nameCol = findColumn("name", "coursemate");
    const idCol = findColumn("identifier", "matric", "id", "number");
    const bookCol = findColumn("book", "title");
    const statusCol = findColumn("status", "completed");

    if (!nameCol) {
      showAlert('Could not find a "name" column in the file', "error");
      return;
    }

    const existing = await getAllStudents();
    const findExistingStudent = (name, identifier) =>
      existing.find(
        (student) =>
          normalize(student.name) === normalize(name) &&
          normalize(student.matricNo) === normalize(identifier),
      );

    let catalogBooks = await getAllCoursesFromCatalog();
    const catalogSet = new Set(catalogBooks.map(b => normalize(b.courseCode)));

    let addedCount = 0;
    let assignmentCount = 0;
    let skippedCount = 0;
    let lastName = "";
    let lastIdentifier = "";

    for (const row of data) {
      const rawName = String(row[nameCol] || "").trim();
      const rawIdentifier = idCol ? String(row[idCol] || "").trim() : "";
      const name = rawName || lastName;
      const matricNo = rawName ? rawIdentifier : lastIdentifier;
      const bookTitle = bookCol ? String(row[bookCol] || "").trim() : "";
      const status = statusCol ? normalizeStatus(row[statusCol]) : "pending";

      if (!name) continue;

      lastName = name;
      lastIdentifier = matricNo;

      let student = findExistingStudent(name, matricNo);

      if (!student) {
        const studentId = await addStudentToDB(name, matricNo);
        student = { id: studentId, name, matricNo };
        existing.push(student);
        addedCount++;
      } else if (!bookTitle) {
        skippedCount++;
      }

      if (bookTitle) {
        const normBook = normalize(bookTitle);
        if (!catalogSet.has(normBook)) {
          await addCourseToCatalog(bookTitle, 0, 0, 0);
          catalogSet.add(normBook);
        }
        const bookId = await addCourseToDB(student.id, bookTitle);
        await updateCourseStatus(bookId, status);
        assignmentCount++;
      }
    }

    fileInput.value = "";
    let msg = `Imported ${addedCount} coursemate(s) and ${assignmentCount} book assignment(s).`;
    if (skippedCount > 0) {
      msg += ` Skipped ${skippedCount} duplicate row(s) because the name already exists.`;
    }
    if (addedCount === 0 && assignmentCount === 0 && skippedCount > 0) {
      msg = `All names already exist in the tracker! Skipped ${skippedCount} duplicate row(s).`;
    }
    showAlert(msg, addedCount > 0 || assignmentCount > 0 ? "success" : "error");
    await refreshUI();
  } catch (error) {
    showAlert("Error importing file: " + error.message, "error");
  }
};

const exportData = async () => {
  try {
    const students = await getAllStudents();
    const books = await getAllCourses();

    if (students.length === 0) {
      showAlert("No data to export", "error");
      return;
    }

    const rows = [["Name", "Matric No", "Book", "Status"]];

    for (const student of students) {
      const assignedBooks = books.filter(
        (book) => book.studentId === student.id,
      );

      if (assignedBooks.length === 0) {
        rows.push([student.name, student.matricNo || "", "", ""]);
        continue;
      }

      assignedBooks.forEach((book, index) => {
        const name = index === 0 ? student.name : "";
        const identifier = index === 0 ? student.matricNo || "" : "";
        rows.push([name, identifier, book.courseCode, getBookStatus(book)]);
      });
    }

    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `coursemate_books_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    window.URL.revokeObjectURL(url);
    link.remove();

    showAlert("Data exported successfully");
  } catch (error) {
    showAlert("Error exporting data: " + error.message, "error");
  }
};

const clearFinancials = async () => {
  if (!confirm("Delete all shared books, assignments, and financial records? (Coursemates will be kept)"))
    return;

  try {
    await clearFinancialsData();
    showAlert("Financials data cleared");
    await refreshUI();
  } catch (error) {
    showAlert("Error clearing financials: " + error.message, "error");
  }
};

const clearAll = async () => {
  if (!confirm("Delete all coursemates, books, and completion records?"))
    return;

  try {
    await clearAllData();
    showAlert("All data cleared");
    await refreshUI();
  } catch (error) {
    showAlert("Error clearing data: " + error.message, "error");
  }
};

window.addEventListener("load", async () => {
  let attempts = 0;
  while (!db && attempts < 20) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    attempts++;
  }

  if (!db) {
    showAlert(
      "Database initialization failed. Please refresh the page.",
      "error",
    );
    return;
  }

  await refreshUI();
  filterByStatus("all");
  showPage("tracker");
});


// --- Class Dues Logic ---
let currentDuesFilter = 'all';

const saveGlobalDue = () => {
  const amountInput = document.getElementById("globalDueAmount");
  if (!amountInput) return;
  const amount = parseFloat(amountInput.value) || 0;
  localStorage.setItem("globalClassDueAmount", amount.toString());
  showAlert("Global Class Due Amount Saved successfully!", "success");
  renderDuesTable();
};

const toggleDuesPaid = async (studentId) => {
  try {
    const student = await getStudentById(studentId);
    if (!student) return;
    const newStatus = !(student.duePaid === true);
    await toggleStudentDue(studentId, newStatus);
    renderDuesTable();
  } catch (err) {
    showAlert("Error updating dues: " + err.message, "error");
  }
};

const removeStudentFromDues = async (studentId) => {
  if (!confirm("Are you sure you want to remove this coursemate from the Class Dues list? They will still be available in the Tracker.")) return;
  try {
    await setStudentDuesExempt(studentId, true);
    await refreshUI();
    showAlert("Coursemate removed from Class Dues", "success");
  } catch (err) {
    showAlert("Error removing from dues: " + err.message, "error");
  }
};

const filterDuesByStatus = (status) => {
  currentDuesFilter = status;
  duesCurrentPage = 1;
  ["duesFilterAll", "duesFilterPending", "duesFilterPaid"].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      if (id.toLowerCase().includes(status)) {
        btn.classList.add(status === "paid" ? "btn-success" : "btn-secondary");
        btn.classList.add("active-filter");
      } else {
        btn.classList.remove("active-filter", "btn-success", "btn-secondary");
        btn.classList.add("btn-secondary");
      }
    }
  });
  renderDuesTable();
};

const renderDuesTable = async () => {
  try {
    const students = await getAllStudents();
    const globalAmountStr = localStorage.getItem("globalClassDueAmount");
    const globalAmount = globalAmountStr ? parseFloat(globalAmountStr) : 0;
    
    const amountInput = document.getElementById("globalDueAmount");
    if (amountInput && globalAmountStr !== null) {
      amountInput.value = globalAmount;
    }

    const searchInput = document.getElementById("duesSearchInput");
    const query = searchInput ? searchInput.value.toLowerCase() : "";

    let filtered = students.filter(s => {
      if (s.excludeFromDues === true) return false;
      const matchSearch = s.name.toLowerCase().includes(query) || (s.matricNo || "").toLowerCase().includes(query);
      if (!matchSearch) return false;
      const isPaid = s.duePaid === true;
      if (currentDuesFilter === "paid" && !isPaid) return false;
      if (currentDuesFilter === "pending" && isPaid) return false;
      return true;
    });

    let totalCollected = 0;
    let expectedCount = 0;
    students.forEach(s => {
      if (s.excludeFromDues === true) return;
      expectedCount++;
      if (s.duePaid === true) totalCollected += globalAmount;
    });

    const expectedEl = document.getElementById("duesTotalExpected");
    const collectedEl = document.getElementById("duesTotalCollected");
    if (expectedEl) expectedEl.textContent = `₦${Number(expectedCount * globalAmount).toFixed(2)}`;
    if (collectedEl) collectedEl.textContent = `₦${Number(totalCollected).toFixed(2)}`;

    const container = document.getElementById("duesTableContainer");
    if (!container) return;

    if (filtered.length === 0) {
      const hasAnyone = students.some((s) => s.excludeFromDues !== true);
      container.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">${hasAnyone ? "No matches" : "No coursemates yet"}</div>
        <p>${hasAnyone ? "Nobody matches this search or filter." : "Add your classmates first, then set the due amount above."}</p>
        ${hasAnyone ? "" : `<div class="button-group"><button class="btn-primary" onclick="showPage('manage')">Add Coursemates</button></div>`}
      </div>`;
      return;
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / duesItemsPerPage));
    if (duesCurrentPage > totalPages) duesCurrentPage = totalPages;
    const startIndex = (duesCurrentPage - 1) * duesItemsPerPage;
    const paginated = filtered.slice(startIndex, startIndex + duesItemsPerPage);

    let html = `<div class="table-wrapper"><table style="font-size: 0.9rem;"><thead><tr>
      <th>Coursemate Name</th>
      <th>Matric No</th>
      <th>Due Amount</th>
      <th>Status</th>
      <th>Action</th>
    </tr></thead><tbody>`;

    paginated.forEach(s => {
      const isPaid = s.duePaid === true;
      const statusClass = isPaid ? "paid" : "pending";
      const statusText = isPaid ? "Paid" : "Pending";
      const iconBtnClass = isPaid ? "danger" : "success";
      const iconHtml = isPaid ? "✗" : "✓";
      const titleText = isPaid ? "Mark as Pending" : "Mark as Paid";
      
      html += `<tr style="padding: 4px;">
        <td data-label="Name" style="padding: 6px 12px;"><strong>${escapeHTML(s.name)}</strong></td>
        <td data-label="Matric No" style="padding: 6px 12px;">${escapeHTML(s.matricNo || "-")}</td>
        <td data-label="Due Amount" style="padding: 6px 12px; font-weight: bold;">${`₦${Number(globalAmount).toFixed(2)}`}</td>
        <td data-label="Status" style="padding: 6px 12px;">
          <span class="assignment-card ${statusClass}" style="display:inline-flex; align-items:center; gap:4px; padding:2px 6px; font-size:0.8rem; min-width:auto;">
            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:${isPaid ? '#2563eb' : '#d97706'}"></span> ${statusText}
          </span>
        </td>
        <td data-label="Action" style="padding: 6px 12px; text-align: right;">
          <button class="icon-button ${iconBtnClass}" onclick="toggleDuesPaid(${s.id})" title="${titleText}" style="width: 28px; height: 28px; min-width: 28px; min-height: 28px;">${iconHtml}</button>
          <button class="icon-button btn-danger" onclick="removeStudentFromDues(${s.id})" title="Remove from Dues" style="width: 28px; height: 28px; min-width: 28px; min-height: 28px; margin-left: 4px;">✖</button>
        </td>
      </tr>`;
    });

    html += `</tbody></table></div>
    <div class="pagination">
      <button class="btn-secondary btn-small" onclick="duesPreviousPage()" ${duesCurrentPage === 1 ? "disabled" : ""}>Previous</button>
      <span>Page <strong>${duesCurrentPage}</strong> of <strong>${totalPages}</strong> (${filtered.length} total)</span>
      <button class="btn-secondary btn-small" onclick="duesNextPage()" ${duesCurrentPage === totalPages ? "disabled" : ""}>Next</button>
    </div>`;
    container.innerHTML = html;

  } catch (err) {
    console.error("Error rendering dues table", err);
  }
};

// --- Mass Add Logic ---
const massAddStudentsFromText = async () => {
  const inputEl = document.getElementById("massAddInput");
  const excludeCb = document.getElementById("excludeFromDues");
  const excludeFromDues = excludeCb ? excludeCb.checked : false;

  if (!inputEl) return;
  const lines = inputEl.value.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  
  if (lines.length === 0) {
    showAlert("Please paste some names first", "error");
    return;
  }

  let count = 0;
  let skipped = 0;
  
  // Get existing students to check for duplicates
  const existingStudents = await getAllStudents();
  const existingNames = new Set(existingStudents.map(s => s.name.toLowerCase()));
  const existingMatrics = new Set(existingStudents.map(s => (s.matricNo || "").toLowerCase()).filter(m => m !== ""));

  for (const line of lines) {
    // Basic splitting by comma if available, else whole line is name
    const parts = line.split(",");
    const name = parts[0].trim();
    const matricNo = parts.length > 1 ? parts[1].trim() : "";
    
    if (name) {
      // Duplicate check
      if (existingNames.has(name.toLowerCase()) || (matricNo && existingMatrics.has(matricNo.toLowerCase()))) {
        skipped++;
        continue;
      }
      
      const studentId = await addStudentToDB(name, matricNo, excludeFromDues);
      
      // Update our sets so we don't add duplicates from within the same paste
      existingNames.add(name.toLowerCase());
      if (matricNo) existingMatrics.add(matricNo.toLowerCase());
      
      // Automatically assign all current catalog books if checked
      const assignAll = document.getElementById("assignAllBooks") ? document.getElementById("assignAllBooks").checked : true;
      if (assignAll) {
        const catalog = await getAllCoursesFromCatalog();
        if (catalog && catalog.length > 0) {
          for (const book of catalog) {
            await addCourseToDB(studentId, book.courseCode);
          }
        }
      }
      count++;
    }
  }

  inputEl.value = "";
  let msg = `Successfully added ${count} coursemates!`;
  if (skipped > 0) {
    msg += ` (${skipped} were skipped because they already exist)`;
  }
  showAlert(msg, count > 0 ? "success" : "error");
  await refreshUI();
};

const exportDuesCSV = async () => {
  try {
    const students = await getAllStudents();
    const globalAmountStr = localStorage.getItem("globalClassDueAmount");
    const globalAmount = globalAmountStr ? parseFloat(globalAmountStr) : 0;
    
    if (!students || students.length === 0) {
      showAlert("No coursemates to export", "error");
      return;
    }

    const rows = [];
    rows.push(["Name", "Matric No", "Due Amount (NGN)", "Status"]);

    students.forEach((s) => {
      rows.push([
        s.name,
        s.matricNo || "",
        globalAmount.toString(),
        s.duePaid === true ? "Paid" : "Pending"
      ]);
    });

    const csvEscape = (val) => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `class_dues_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    window.URL.revokeObjectURL(url);
    link.remove();

    showAlert("Dues data exported successfully");
  } catch (error) {
    showAlert("Error exporting dues: " + error.message, "error");
  }
};

const duesNextPage = () => {
  duesCurrentPage++;
  renderDuesTable();
};

const duesPreviousPage = () => {
  if (duesCurrentPage > 1) {
    duesCurrentPage--;
    renderDuesTable();
  }
};

// IndexedDB storage for the coursemate book tracker.
let db;

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("StudentCourseDB", 3);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains("students")) {
        database.createObjectStore("students", {
          keyPath: "id",
          autoIncrement: true,
        });
      }

      if (!database.objectStoreNames.contains("courses")) {
        database.createObjectStore("courses", {
          keyPath: "id",
          autoIncrement: true,
        });
      }

      if (!database.objectStoreNames.contains("courseCatalog")) {
        database.createObjectStore("courseCatalog", {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
  });
};

const runStoreRequest = (storeNames, mode, callback) => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error("Database not initialized"));
      return;
    }

    const transaction = db.transaction(storeNames, mode);
    const result = callback(transaction);

    transaction.oncomplete = () => resolve(result?.value);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
};

const addStudentToDB = (name, matricNo = "", excludeFromDues = false) => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error("Database not initialized"));
      return;
    }

    const transaction = db.transaction(["students"], "readwrite");
    const store = transaction.objectStore("students");
    const request = store.add({
      name,
      matricNo,
      duePaid: false,
      excludeFromDues,
      createdAt: new Date(),
    });

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
};

const getAllStudents = () => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["students"], "readonly");
    const store = transaction.objectStore("students");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getStudentById = (id) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["students"], "readonly");
    const store = transaction.objectStore("students");
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const updateStudent = (id, name, matricNo = "", excludeFromDues = false) => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error("Database not initialized"));
      return;
    }

    const transaction = db.transaction(["students"], "readwrite");
    const store = transaction.objectStore("students");
    const request = store.get(id);

    request.onsuccess = () => {
      const student = request.result;
      if (!student) {
        reject(new Error("Coursemate not found"));
        return;
      }

      student.name = name;
      student.matricNo = matricNo;
      student.excludeFromDues = excludeFromDues;

      const updateRequest = store.put(student);
      updateRequest.onsuccess = () => resolve();
      updateRequest.onerror = () => reject(updateRequest.error);
    };

    request.onerror = () => reject(request.error);
  });
};

const deleteStudent = (studentId) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["students", "courses", "courseCatalog"], "readwrite");
    const studentStore = transaction.objectStore("students");
    const courseStore = transaction.objectStore("courses");
    const catalogStore = transaction.objectStore("courseCatalog");

    // 1. Get all courses for this student
    const getCoursesRequest = courseStore.getAll();
    getCoursesRequest.onsuccess = () => {
      const allCourses = getCoursesRequest.result;
      const studentCourses = allCourses.filter(c => c.studentId === studentId);
      
      // 2. Get the catalog to matching and update sold count
      const getCatalogRequest = catalogStore.getAll();
      getCatalogRequest.onsuccess = () => {
        const catalog = getCatalogRequest.result;
        
        studentCourses.forEach(course => {
          // Check if the course is paid/completed
          const isSold = course.status === "paid" || course.status === "completed" || course.arranged === true;
          if (isSold) {
            const catalogItem = catalog.find(item => item.courseCode.toLowerCase() === course.courseCode.toLowerCase());
            if (catalogItem) {
              catalogItem.quantityBought = (catalogItem.quantityBought || 0) + 1;
              catalogStore.put(catalogItem);
            }
          }
          // Delete student's course assignment
          courseStore.delete(course.id);
        });

        // Delete the student record
        studentStore.delete(studentId);
      };
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

const addCourseToDB = (studentId, courseCode) => {
  return new Promise((resolve, reject) => {
    const normalizedCode = courseCode.trim();
    const transaction = db.transaction(["courses"], "readwrite");
    const store = transaction.objectStore("courses");
    const allRequest = store.getAll();

    allRequest.onsuccess = () => {
      const existing = allRequest.result.find(
        (course) =>
          course.studentId === studentId &&
          course.courseCode.toLowerCase() === normalizedCode.toLowerCase(),
      );

      if (existing) {
        resolve(existing.id);
        return;
      }

      const addRequest = store.add({
        studentId,
        courseCode: normalizedCode,
        arranged: false,
        status: "pending",
        createdAt: new Date(),
      });

      addRequest.onsuccess = () => resolve(addRequest.result);
      addRequest.onerror = () => reject(addRequest.error);
    };

    allRequest.onerror = () => reject(allRequest.error);
    transaction.onerror = () => reject(transaction.error);
  });
};

const getCoursesByStudent = (studentId) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["courses"], "readonly");
    const store = transaction.objectStore("courses");
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result.filter((course) => course.studentId === studentId));
    };

    request.onerror = () => reject(request.error);
  });
};

const updateCourseStatus = (courseId, status) => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error("Database not initialized"));
      return;
    }

    const transaction = db.transaction(["courses"], "readwrite");
    const store = transaction.objectStore("courses");
    const request = store.get(courseId);

    request.onsuccess = () => {
      const course = request.result;
      if (!course) {
        reject(new Error("Book assignment not found"));
        return;
      }

      course.status = status;
      course.arranged = status === "completed";

      const updateRequest = store.put(course);
      updateRequest.onsuccess = () => resolve();
      updateRequest.onerror = () => reject(updateRequest.error);
    };

    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
};

const deleteCourse = (courseId) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["courses"], "readwrite");
    const request = transaction.objectStore("courses").delete(courseId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const getAllCourses = () => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["courses"], "readonly");
    const store = transaction.objectStore("courses");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const clearFinancialsData = () => {
  return runStoreRequest(
    ["courses", "courseCatalog"],
    "readwrite",
    (transaction) => {
      transaction.objectStore("courses").clear();
      transaction.objectStore("courseCatalog").clear();
    },
  );
};

const clearAllData = () => {
  return runStoreRequest(
    ["students", "courses", "courseCatalog"],
    "readwrite",
    (transaction) => {
      transaction.objectStore("students").clear();
      transaction.objectStore("courses").clear();
      transaction.objectStore("courseCatalog").clear();
    },
  );
};

const addCourseToCatalog = (courseCode, price = 0, buyingPrice = 0, quantityBought = 0) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["courseCatalog"], "readwrite");
    const store = transaction.objectStore("courseCatalog");
    const request = store.add({
      courseCode: courseCode.trim(),
      price: Number(price) || 0,
      buyingPrice: Number(buyingPrice) || 0,
      quantityBought: Number(quantityBought) || 0,
      createdAt: new Date(),
    });

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getAllCoursesFromCatalog = () => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["courseCatalog"], "readonly");
    const store = transaction.objectStore("courseCatalog");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const deleteCourseCatalog = (catalogCourseId) => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      ["courseCatalog", "courses"],
      "readwrite",
    );
    const catalogStore = transaction.objectStore("courseCatalog");
    const courseStore = transaction.objectStore("courses");
    const catalogRequest = catalogStore.get(catalogCourseId);

    catalogRequest.onsuccess = () => {
      const catalogCourse = catalogRequest.result;
      if (!catalogCourse) return;

      catalogStore.delete(catalogCourseId);

      const allCoursesRequest = courseStore.getAll();
      allCoursesRequest.onsuccess = () => {
        allCoursesRequest.result.forEach((course) => {
          if (
            course.courseCode.toLowerCase() ===
            catalogCourse.courseCode.toLowerCase()
          ) {
            courseStore.delete(course.id);
          }
        });
      };
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

const updateCourseCatalogDetails = (id, price, buyingPrice, quantityBought, courseCode) => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error("Database not initialized"));
      return;
    }

    const transaction = db.transaction(["courseCatalog"], "readwrite");
    const store = transaction.objectStore("courseCatalog");
    const request = store.get(id);

    request.onsuccess = () => {
      const book = request.result;
      if (!book) {
        reject(new Error("Book not found in catalog"));
        return;
      }

      if (courseCode !== undefined) book.courseCode = courseCode.trim();
      book.price = Number(price) || 0;
      book.buyingPrice = Number(buyingPrice) || 0;
      if (quantityBought !== undefined) book.quantityBought = Number(quantityBought) || 0;

      const updateRequest = store.put(book);
      updateRequest.onsuccess = () => resolve();
      updateRequest.onerror = () => reject(updateRequest.error);
    };

    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
};



const setStudentDuesExempt = (studentId, isExempt) => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error("Database not initialized"));
      return;
    }

    const transaction = db.transaction(["students"], "readwrite");
    const store = transaction.objectStore("students");
    const request = store.get(studentId);

    request.onsuccess = () => {
      const student = request.result;
      if (!student) {
        reject(new Error("Coursemate not found"));
        return;
      }

      student.excludeFromDues = isExempt;

      const updateRequest = store.put(student);
      updateRequest.onsuccess = () => resolve();
      updateRequest.onerror = () => reject(updateRequest.error);
    };

    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
};

const toggleStudentDue = (studentId, isPaid) => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error("Database not initialized"));
      return;
    }

    const transaction = db.transaction(["students"], "readwrite");
    const store = transaction.objectStore("students");
    const request = store.get(studentId);

    request.onsuccess = () => {
      const student = request.result;
      if (!student) {
        reject(new Error("Coursemate not found"));
        return;
      }

      student.duePaid = isPaid;

      const updateRequest = store.put(student);
      updateRequest.onsuccess = () => resolve();
      updateRequest.onerror = () => reject(updateRequest.error);
    };

    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
};

document.addEventListener("DOMContentLoaded", () => {
  initDB().catch((err) => {
    console.error("Database initialization error:", err);
    if (typeof showAlert !== "undefined") {
      showAlert("Error initializing database: " + err.message, "error");
    }
  });
});

window.addEventListener("load", () => {
  if (!db) {
    initDB().catch((err) => {
      console.error("Database re-initialization error:", err);
    });
  }
});

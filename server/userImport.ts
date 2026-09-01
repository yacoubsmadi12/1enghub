import * as XLSX from "xlsx";

export type UserImportRow = {
  rowNumber: number;
  employeeNumber: string;
  fullName: string;
  managerNumber: string | null;
  managerName: string | null;
  username: string;
  password: string;
  email: string | null;
  teamName: string | null;
};

const aliases = {
  employeeNumber: ["employee number", "employee_number", "employee no", "emp no", "رقم الموظف"],
  fullName: ["full name", "full_name", "name", "الاسم الكامل", "اسم الموظف"],
  managerNumber: ["manager number", "manager_number", "manager no", "رقم المدير"],
  managerName: ["manager name", "manager_name", "اسم المدير"],
  username: ["user name", "username", "user_name", "اسم المستخدم"],
  password: ["password", "كلمة المرور"],
  email: ["email adress", "email address", "email", "البريد الالكتروني", "البريد الإلكتروني"],
  teamName: ["team name", "team", "اسم الفريق"],
} as const;

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

function valueAt(row: unknown[], index: number | undefined) {
  return index === undefined ? "" : String(row[index] ?? "").trim();
}

export function parseUserImportWorkbook(bytes: Buffer): UserImportRow[] {
  if (!bytes.length) throw new Error("The Excel file is empty");
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
  } catch {
    throw new Error("The uploaded file is not a readable Excel workbook");
  }
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("The Excel workbook has no sheets");
  const sheet = workbook.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
  const headerIndex = matrix.findIndex(row => {
    const normalized = row.map(normalizeHeader);
    return aliases.employeeNumber.some(alias => normalized.includes(normalizeHeader(alias))) && aliases.fullName.some(alias => normalized.includes(normalizeHeader(alias)));
  });
  if (headerIndex < 0) throw new Error("Required Excel headers were not found. Use Employee Number, Full Name, Manager Number, Manager Name, user name, password, and Email Address");

  const headers = matrix[headerIndex].map(normalizeHeader);
  const findColumn = (key: keyof typeof aliases) => aliases[key].map(normalizeHeader).map(alias => headers.indexOf(alias)).find(index => index >= 0);
  const columns = {
    employeeNumber: findColumn("employeeNumber"),
    fullName: findColumn("fullName"),
    managerNumber: findColumn("managerNumber"),
    managerName: findColumn("managerName"),
    username: findColumn("username"),
    password: findColumn("password"),
    email: findColumn("email"),
    teamName: findColumn("teamName"),
  };
  const missing = ["employeeNumber", "fullName", "username", "password"].filter(key => columns[key as keyof typeof columns] === undefined);
  if (missing.length) throw new Error(`Required Excel columns are missing: ${missing.join(", ")}`);

  const rows: UserImportRow[] = [];
  const errors: string[] = [];
  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const row = matrix[index];
    if (!row.some(value => String(value ?? "").trim())) continue;
    const parsed: UserImportRow = {
      rowNumber: index + 1,
      employeeNumber: valueAt(row, columns.employeeNumber),
      fullName: valueAt(row, columns.fullName),
      managerNumber: valueAt(row, columns.managerNumber) || null,
      managerName: valueAt(row, columns.managerName) || null,
      username: valueAt(row, columns.username),
      password: valueAt(row, columns.password),
      email: valueAt(row, columns.email) || null,
      teamName: valueAt(row, columns.teamName) || null,
    };
    const rowErrors = [
      !parsed.employeeNumber && "Employee Number is required",
      !parsed.fullName && "Full Name is required",
      !parsed.username && "user name is required",
      !parsed.password && "password is required",
      parsed.password.length > 0 && parsed.password.length < 8 && "password must contain at least 8 characters",
      parsed.email && !/^\S+@\S+\.\S+$/.test(parsed.email) && "Email Address is invalid",
    ].filter(Boolean) as string[];
    if (rowErrors.length) errors.push(`Row ${parsed.rowNumber}: ${rowErrors.join(", ")}`);
    rows.push(parsed);
  }
  if (!rows.length) throw new Error("The Excel workbook does not contain any employee rows");
  const employeeNumbers = new Set<string>();
  const duplicateRows: string[] = [];
  for (const row of rows) {
    if (employeeNumbers.has(row.employeeNumber)) duplicateRows.push(`Row ${row.rowNumber}: duplicate Employee Number ${row.employeeNumber}`);
    employeeNumbers.add(row.employeeNumber);
  }
  if (duplicateRows.length) errors.push(...duplicateRows);
  if (errors.length) throw new Error(errors.join(" | "));
  return rows;
}

export function userImportTemplateCsv() {
  return [
    "Employee Number,Full Name,Manager Number,Manager Name,user name,password,Email Address,Team Name",
    "1001,Example Manager,,, ,manager.password,manager@company.com,Engineering Team",
    "1002,Example Employee,1001,Example Manager,example.employee,employee.password,employee@company.com,Engineering Team",
  ].join("\n");
}

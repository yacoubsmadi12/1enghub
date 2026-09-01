import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseUserImportWorkbook } from "./userImport";

describe("ENGHUB user Excel import", () => {
  it("parses the requested headers and optional team name", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Employee Number", "Full Name", "Manager Number", "Manager Name", "user name", "password", "Email Adress", "Team Name"],
      ["1001", "Manager One", "", "", "manager.one", "manager.password", "manager@example.com", "Network Team"],
      ["1002", "Member One", "1001", "Manager One", "member.one", "member.password", "member@example.com", "Network Team"],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Users");
    const rows = parseUserImportWorkbook(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ employeeNumber: "1002", managerNumber: "1001", username: "member.one", teamName: "Network Team" });
  });

  it("rejects a row with a weak password before database writes", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Employee Number", "Full Name", "user name", "password"],
      ["1001", "Manager One", "manager.one", "short"],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Users");
    expect(() => parseUserImportWorkbook(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }))).toThrow(/password must contain at least 8 characters/);
  });
});

import {
  readPeselBirthDate,
  readPeselData,
  readPeselGender,
  validatePesel
} from "@klinika/domain";

describe("PESEL domain rules", () => {
  it("odczytuje datę urodzenia i płeć z poprawnego numeru PESEL", () => {
    expect(readPeselBirthDate("44051401458")).toBe("1944-05-14");
    expect(readPeselGender("44051401458")).toBe("MALE");
    expect(readPeselGender("123")).toBeNull();
    expect(readPeselGender("abcdefghijk")).toBeNull();
    expect(readPeselData("02270803624")).toEqual({
      birthDate: "2002-07-08",
      gender: "FEMALE"
    });
  });

  it("obsługuje stulecia zakodowane w miesiącu PESEL", () => {
    expect(readPeselBirthDate("01810100000")).toBe("1801-01-01");
    expect(readPeselBirthDate("01210100000")).toBe("2001-01-01");
    expect(readPeselBirthDate("01410100000")).toBe("2101-01-01");
    expect(readPeselBirthDate("01610100000")).toBe("2201-01-01");
  });

  it("zwraca błąd długości, cyfr, daty i sumy kontrolnej", () => {
    expect(validatePesel("123")).toEqual({
      valid: false,
      errors: [{ field: "pesel", code: "INVALID_LENGTH" }]
    });
    expect(validatePesel("abcdefghijk")).toEqual({
      valid: false,
      errors: [{ field: "pesel", code: "INVALID_DIGITS" }]
    });
    expect(validatePesel("44993101458")).toEqual({
      valid: false,
      errors: [
        { field: "pesel", code: "INVALID_BIRTH_DATE" },
        { field: "pesel", code: "INVALID_CHECKSUM" }
      ]
    });
    expect(validatePesel("44051401457")).toEqual({
      valid: false,
      errors: [{ field: "pesel", code: "INVALID_CHECKSUM" }]
    });
  });
});

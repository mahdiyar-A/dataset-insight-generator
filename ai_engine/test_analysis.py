from ai_engine.core.analyzer import analyze_csv
import json

def run_test(path):
    print(f"\n=== Testing: {path} ===")
    result = analyze_csv(path)
    print(json.dumps(result, indent=4))

if __name__ == "__main__":
    run_test("tests/small.csv")
    run_test("tests/messy.csv")
    run_test("tests/clean.csv")
    run_test("tests/weird.csv")
    run_test("tests/messyTen.csv")
    run_test("tests/cleanTwenty.csv")

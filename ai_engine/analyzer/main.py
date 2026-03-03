from ai_engine.core.analyzer import  analyze_csv

if __name__ == "__main__":
    csv_file = "test.csv"
    result = analyze_csv(csv_file)
    print(result)
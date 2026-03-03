import asyncio
from ai_engine.core.analyzer_async import analyze_csv_async
import json

async def run_test(path):
    print(f"\n=== Testing (async): {path} ===")
    result = await analyze_csv_async(path)
    print(json.dumps(result, indent=4))

if __name__ == "__main__":
    asyncio.run(run_test("tests/clean.csv"))
    asyncio.run(run_test("tests/small.csv"))
    asyncio.run(run_test("tests/messy.csv"))
    asyncio.run(run_test("tests/messyTen.csv"))
    asyncio.run(run_test("tests/weirdTen.csv"))
    asyncio.run(run_test("tests/cleanTwenty.csv"))


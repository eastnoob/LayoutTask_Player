from pathlib import Path
import os

from .storage import ReceiverStorage


def main() -> None:
    data_dir = Path(os.environ.get("DATA_DIR", "/app/data"))
    ReceiverStorage(data_dir).clear_data()
    print(f"cleared receiver data in {data_dir}")


if __name__ == "__main__":
    main()

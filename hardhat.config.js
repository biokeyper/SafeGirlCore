import * as dotenv from "dotenv";

dotenv.config();

/** @type import('hardhat/config').HardhatUserConfig */
export default {
  solidity: "0.8.20",

  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
    },
  },

  mocha: {
    timeout: 40000,
  },
};

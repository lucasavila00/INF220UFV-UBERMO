import * as express from "express";
import { Endereco, validateEndereco } from "../shared/endereco";
import { validaEmail } from "../shared/email";
import { validaSenha } from "../shared/senha";
import { LoginResponse } from "../shared/login";
import * as pgPromise from "pg-promise";

// {
// 	"nome": "aaaaaaaaaaa",
// 	"telefone": "1234-56777",
// 	"senha": "abcbcbcbc",
// 	"email": "asdasdasdasdasdasd",
// 	"cartao": {
// 		"nome": "aaaaaaaaaaa",
// 		"numero": "89423234234234234",
// 		"anovencimento": 19,
// 		"mesvencimento": 11
// 	},
// 	"endereco": {
// 		"uf": "MG",
// 		"cidade": "Viçosa",
// 		"bairro": "abc",
// 		"logradouro": "ahahahha",
// 		"numero": "222",
// 		"complemento": "",
// 		"cep": "35180-240"
// 	}
// }

interface CartaoCredito {
  nome: string;
  numero: string;
  mesvencimento: number;
  anovencimento: number;
}

interface RequestBody {
  nome: string;
  telefone: string;
  senha: string;
  cartao: CartaoCredito;
  endereco: Endereco;
  email: String;
}

const validateBody = (body: RequestBody) => {
  const { nome, telefone, senha, email } = body;

  validaEmail(email);
  validaSenha(senha);

  if (typeof nome !== "string" || nome.length < 3 || nome.length > 100)
    throw Error("Nome inválido");

  if (
    typeof telefone !== "string" ||
    telefone.length < 8 ||
    telefone.length > 15
  )
    throw Error("Telefone inválido");

  validateEndereco(body.endereco);
  validateCC(body.cartao);
};

const validateCC = (cc: CartaoCredito) => {
  if (!cc) throw Error("Cartao de crédito não informado");
  const { nome, numero, mesvencimento, anovencimento } = cc;
  if (
    typeof nome !== "string" ||
    typeof numero !== "string" ||
    typeof mesvencimento !== "number" ||
    typeof anovencimento !== "number"
  )
    throw Error("Cartão de crédito inválido");
};

export default (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  validateBody(req.body);

  const db: pgPromise.IDatabase<{}> = res.locals.db;
  const body: RequestBody = req.body;

  const { endereco, cartao } = body;
  db
    .tx(t =>
      t
        .none(
          "INSERT INTO UBERMO.CLIENTE(nome, telefone, nota, email, hash) " +
            "VALUES ($1, $2, $3, $4, crypt($5, gen_salt('bf')))",
          [body.nome, body.telefone, 0, body.email, body.senha]
        )
        .then(() =>
          t.batch([
            t.none(
              "INSERT INTO UBERMO.ENDERECOCLIENTE " +
                "(cliente, uf, cidade, bairro, logradouro, numero, complemento, cep) " +
                "values ($1, $2, $3, $4, $5, $6, $7, $8)",
              [
                body.email,
                endereco.uf,
                endereco.cidade,
                endereco.bairro,
                endereco.logradouro,
                endereco.numero,
                endereco.complemento,
                endereco.cep
              ]
            ),
            t.none(
              "INSERT INTO UBERMO.CARTAO " +
                "(cliente, nome, numero, anovencimento, mesvencimento) " +
                "values ($1, $2, $3, $4, $5)",
              [
                body.email,
                cartao.nome,
                cartao.numero,
                cartao.anovencimento,
                cartao.mesvencimento
              ]
            )
          ])
        )
    )
    .then(() => {
      const response: LoginResponse = {
        nome: body.nome,
        jwt: "abc"
      };
      res.json(response);
    })
    .catch(err => {
      if (err.code === "23505" /* Unique violation */) {
        res.status(500);
        res.json({ message: "E-mail já cadastrado" });
      } else {
        res.status(500);
        res.json(err);
      }
    });
};

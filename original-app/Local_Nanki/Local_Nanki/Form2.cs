using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace Local_Nanki
{
    public partial class Form2 : Form
    {
        public Form2(string abc ,DataSet dd)
        {
            InitializeComponent();
            No = abc;
            dt = dd;
        }

        private string No = "";
        private DataSet dt;
        private DataTable dtt;

        private void Form2_Load(object sender, EventArgs e)
        {
            dtt = dt.Tables[0];
            for (int hh = 0; hh < dtt.Rows.Count; hh++)
            {
                DataRow Ne_Row = dataSet6.DataTable2.NewRow();
                for (int ii = 0; ii < dtt.Columns.Count; ii++)
                {
                    Ne_Row[ii] = dtt.Rows[hh][ii].ToString();
                }
                dataSet6.DataTable2.Rows.Add(Ne_Row);
            }


            foreach (DataSet6.DataTable2Row abc in dataSet6.DataTable2)
            {
                DataRow N_row = dataSet9.DataTable1.NewRow();
                if (abc._受注No_.ToString().Length > 5)
                {
                    string N_No = abc._受注No_.ToString().Substring(0, 6);
                    if (N_No == No)
                    {
                        if (abc.顧客名 != "")
                        {
                            label1.Text = "受注No. " + abc._受注No_.ToString();
                            label2.Text = abc.顧客名.ToString();
                            label3.Text = "納品日 " + abc.納品日.ToString();
                            label4.Text = "発注日時 " + abc.発注日時.ToString();

                        }
                        else
                        {
                            N_row[0] = abc.商品コード.ToString();
                            N_row[1] = abc.商品名.ToString();                           
                            N_row[2] = abc.規格.ToString();
                            N_row[3] = abc.売単価.ToString();
                            N_row[4] = abc.仕入単価.ToString();
                            N_row[5] = abc.単位.ToString();
                            N_row[6] = abc.数量.ToString();
                            N_row[7] = abc.金額.ToString();
                            N_row[8] = "";
                           
                            dataSet9.DataTable1.Rows.Add(N_row);
                        }
                    }
                }
            }

            int All_Total = 0;
            foreach (DataSet9.DataTable1Row abc in dataSet9.DataTable1)
            {
                int AA = 0;
                int BB = 0;
                int CC = 0;
                if (int.TryParse(abc[3].ToString(), out AA) == true && int.TryParse(abc[4].ToString(), out BB) == true && int.TryParse(abc[6].ToString(), out CC) == true)
                {
                    int Total = (AA - BB) * CC;
                    All_Total += Total;
                    abc[8] = Total.ToString("n0");
                }
            }
            dataSet9.DataTable1.Rows[dataSet9.DataTable1.Rows.Count - 1][8] = All_Total.ToString("n0");

            dataGridView1.ClearSelection();
        }

       
        private void button2_Click(object sender, EventArgs e)/////////////////閉じる
        {
            this.Close();
        }
    }
}
